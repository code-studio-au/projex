import type { ProjectId } from '../types';
import { z } from 'zod';

import { parseJsonWithSchema } from '../utils/json';

/**
 * UI preference persistence.
 *
 * Intentionally kept separate from domain persistence so we can later migrate:
 * - from `localStorage` to server-side user preferences (TanStack Start/server functions)
 * - or to IndexedDB / other client stores
 *
 * IMPORTANT: These preferences are non-authoritative and may be cleared at any time.
 */

const BUDGET_COLLAPSE_KEY_VERSION = 'projex_budget_collapse_v1';

type BudgetCollapseStorageScope = {
  userId?: string | null;
};

function budgetCollapseKey(
  projectId: ProjectId,
  scope?: BudgetCollapseStorageScope
) {
  const normalizedUserId = scope?.userId?.trim();
  if (!normalizedUserId) {
    return `${BUDGET_COLLAPSE_KEY_VERSION}:anonymous:${projectId}`;
  }
  return `${BUDGET_COLLAPSE_KEY_VERSION}:${normalizedUserId}:${projectId}`;
}

export type BudgetCollapseState = {
  /** Years that are collapsed, e.g. "2025" */
  collapsedYears: Record<string, true>;
  /** Quarters that are collapsed, e.g. "2025-Q1" */
  collapsedQuarters: Record<string, true>;
};

const trueRecordSchema = z.record(z.string(), z.literal(true));
const budgetCollapseStateSchema = z.object({
  collapsedYears: trueRecordSchema.default({}),
  collapsedQuarters: trueRecordSchema.default({}),
});

export function loadBudgetCollapseState(
  projectId: ProjectId,
  scope?: BudgetCollapseStorageScope
): BudgetCollapseState | null {
  try {
    const raw = localStorage.getItem(budgetCollapseKey(projectId, scope));
    if (!raw) return null;
    const parsed = parseJsonWithSchema(raw, budgetCollapseStateSchema);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveBudgetCollapseState(
  projectId: ProjectId,
  state: BudgetCollapseState,
  scope?: BudgetCollapseStorageScope
) {
  try {
    localStorage.setItem(
      budgetCollapseKey(projectId, scope),
      JSON.stringify(state)
    );
  } catch {
    // ignore (storage blocked/quota/etc.)
  }
}

export function clearBudgetCollapseState(
  projectId: ProjectId,
  scope?: BudgetCollapseStorageScope
) {
  try {
    localStorage.removeItem(budgetCollapseKey(projectId, scope));
  } catch {
    // ignore
  }
}
