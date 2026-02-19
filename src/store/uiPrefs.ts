import type { ProjectId } from "../types";

/**
 * UI preference persistence.
 *
 * Intentionally kept separate from domain persistence so we can later migrate:
 * - from `localStorage` to server-side user preferences (TanStack Start/server functions)
 * - or to IndexedDB / other client stores
 *
 * IMPORTANT: These preferences are non-authoritative and may be cleared at any time.
 */

const BUDGET_COLLAPSE_KEY_VERSION = "projex_budget_collapse_v1";

/**
 * Returns the storage key for budget collapse state.
 *
 * TODO(auth): When real authentication is added, upgrade this key to include userId:
 *   `projex_budget_collapse_v2:${userId}:${projectId}`
 * so collapse preferences become per-user per-project.
 */
function budgetCollapseKey(projectId: ProjectId) {
  return `${BUDGET_COLLAPSE_KEY_VERSION}:${projectId}`;
}

export type BudgetCollapseState = {
  /** Years that are collapsed, e.g. "2025" */
  collapsedYears: Record<string, true>;
  /** Quarters that are collapsed, e.g. "2025-Q1" */
  collapsedQuarters: Record<string, true>;
};

export function loadBudgetCollapseState(projectId: ProjectId): BudgetCollapseState | null {
  try {
    const raw = localStorage.getItem(budgetCollapseKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BudgetCollapseState> | null;
    if (!parsed) return null;

    return {
      collapsedYears: (parsed.collapsedYears ?? {}) as Record<string, true>,
      collapsedQuarters: (parsed.collapsedQuarters ?? {}) as Record<string, true>,
    };
  } catch {
    return null;
  }
}

export function saveBudgetCollapseState(projectId: ProjectId, state: BudgetCollapseState) {
  try {
    localStorage.setItem(budgetCollapseKey(projectId), JSON.stringify(state));
  } catch {
    // ignore (storage blocked/quota/etc.)
  }
}

export function clearBudgetCollapseState(projectId: ProjectId) {
  try {
    localStorage.removeItem(budgetCollapseKey(projectId));
  } catch {
    // ignore
  }
}
