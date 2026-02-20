import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import type { ProjectId } from '../types';
import type { BudgetLine } from '../types';
import type { BudgetCreateInput, BudgetUpdateInput } from '../api/contract';
import { qk } from './keys';

export function useBudgetsQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.budgets(projectId),
    queryFn: () => api.listBudgets(projectId),
  });
}

export function useCreateBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetCreateInput) => api.createBudget(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(projectId) }),
  });
}

export function useUpdateBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetUpdateInput) => api.updateBudget(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(projectId) }),
  });
}

export function useDeleteBudgetMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (budgetId: BudgetLine['id']) => api.deleteBudget(projectId, budgetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.budgets(projectId) }),
  });
}
