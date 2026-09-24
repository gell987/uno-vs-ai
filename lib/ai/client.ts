import { decide } from "./decide";
import { readHand } from "./heuristic";
import type { Decision, DecisionContext, HandRead } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
type RequestBody = { kind: "decide"; ctx: DecisionContext } | { kind: "read"; ctx: DecisionContext; target: number };

/**
 * Runs AI thinking in a Web Worker so Monte Carlo search never blocks the UI.
 * Falls back to the main thread (with a smaller budget) if workers are unavailable.
 */
export class AiClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    if (typeof window === "undefined" || typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      };
      this.worker.onerror = (event) => {
        event.preventDefault?.();
        this.failWorker();
      };
    } catch {
      this.worker = null;
    }
  }

  private failWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error("AI worker unavailable"));
    this.pending.clear();
  }

  private run<T>(body: RequestBody, local: () => T): Promise<T> {
    const fallback = () =>
      new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(local());
          } catch (e) {
            reject(e);
          }
        }, 0);
      });
    if (!this.worker) return fallback();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ ...body, id } as WorkerRequest);
    }).catch(fallback);
  }

  decide(ctx: DecisionContext): Promise<Decision> {
    return this.run({ kind: "decide", ctx }, () => decide({ ...ctx, budgetMs: Math.min(ctx.budgetMs ?? 250, 250) }));
  }

  read(ctx: DecisionContext, target: number): Promise<HandRead> {
    return this.run({ kind: "read", ctx, target }, () => readHand(ctx, target));
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
