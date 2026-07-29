import type { ProjectId } from '../types';

export type ProjectSettingMutationKey =
  | 'structure'
  | 'currency'
  | 'visibility'
  | 'superadmin-access'
  | 'company-standards-sync'
  | 'transaction-transfers';

export function budgetUpdateMutationScope(projectId: ProjectId) {
  return { id: `budget-update:${projectId}` } as const;
}

export function transactionUpdateMutationScope(projectId: ProjectId) {
  return { id: `transaction-update:${projectId}` } as const;
}

export function projectSettingMutationScope(
  projectId: ProjectId,
  setting: ProjectSettingMutationKey
) {
  return { id: `project-setting:${projectId}:${setting}` } as const;
}
