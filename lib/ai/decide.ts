import { STYLES, heuristicDecide } from "./heuristic";
import { searchDecide } from "./search";
import type { Decision, DecisionContext } from "./types";

export const DEFAULT_SEARCH_BUDGET_MS = 650;

/** Picks a move for the AI whose view is in `ctx`. Pure apart from the time budget. */
export function decide(ctx: DecisionContext): Decision {
  switch (ctx.difficulty) {
    case "rookie":
      return heuristicDecide(ctx, STYLES.rookie);
    case "casual":
      return heuristicDecide(ctx, STYLES.casual);
    case "shark":
      return heuristicDecide(ctx, STYLES.shark);
    case "grandmaster":
      return searchDecide(ctx, {
        budgetMs: ctx.budgetMs ?? DEFAULT_SEARCH_BUDGET_MS,
        minIterations: 64,
        maxIterations: 20_000,
      });
  }
}
