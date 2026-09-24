/// <reference lib="webworker" />
import { decide } from "./decide";
import { readHand } from "./heuristic";
import type { DecisionContext } from "./types";

export type WorkerRequest =
  | { id: number; kind: "decide"; ctx: DecisionContext }
  | { id: number; kind: "read"; ctx: DecisionContext; target: number };

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const result = req.kind === "decide" ? decide(req.ctx) : readHand(req.ctx, req.target);
    scope.postMessage({ id: req.id, ok: true, result } satisfies WorkerResponse);
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
