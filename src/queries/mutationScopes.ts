import type { ProjectId } from '../types';

export function budgetUpdateMutationScope(projectId: ProjectId) {
  return { id: `budget-update:${projectId}` } as const;
}

export function transactionUpdateMutationScope(projectId: ProjectId) {
  return { id: `transaction-update:${projectId}` } as const;
}
