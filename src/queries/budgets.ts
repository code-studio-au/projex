import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import type { ProjectId } from '../types';
import type { BudgetLine } from '../types';
import type { BudgetCreateInput, BudgetUpdateInput } from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useBudgetsQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.budgets(scopeUserId, projectId),
    queryFn: () => api.listBudgets(projectId),
  });
}

export function useCreateBudgetMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BudgetCreateInput) => api.createBudget(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
  });
}

export function useUpdateBudgetMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BudgetUpdateInput) => api.updateBudget(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
  });
}

export function useDeleteBudgetMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (budgetId: BudgetLine['id']) => api.deleteBudget(projectId, budgetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
  });
}
