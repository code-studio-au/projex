import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ProjectId } from '../types';
import type { BudgetLine } from '../types';
import type { BudgetCreateInput, BudgetUpdateInput } from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  createBudgetServerFn,
  deleteBudgetServerFn,
  listBudgetsServerFn,
  updateBudgetServerFn,
} from '../server/start/functions/budgetReads';

export function useBudgetsQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(budgetsQueryOptions(scopeUserId, projectId, options));
}

export function budgetsQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.budgets(userId, projectId),
    queryFn: () => listBudgetsServerFn({ data: { projectId } }),
    enabled: options.enabled ?? true,
  } as const;
}

export function useCreateBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BudgetCreateInput) =>
      createBudgetServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useUpdateBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BudgetUpdateInput) =>
      updateBudgetServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useDeleteBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (budgetId: BudgetLine['id']) =>
      deleteBudgetServerFn({ data: { projectId, budgetId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}
