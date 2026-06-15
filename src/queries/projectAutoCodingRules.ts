import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { ProjectAutoCodingRule, ProjectId } from '../types';
import type {
  CreateProjectAutoCodingRuleInput,
  ProjectAutoCodingRuleUpdateInput,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  createProjectAutoCodingRuleServerFn,
  deleteProjectAutoCodingRuleServerFn,
  listProjectAutoCodingRulesServerFn,
  updateProjectAutoCodingRuleServerFn,
} from '../server/start/functions/projectAutoCodingRules';

export function useProjectAutoCodingRulesQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(projectAutoCodingRulesQueryOptions(scopeUserId, projectId));
}

export function projectAutoCodingRulesQueryOptions(
  userId: string,
  projectId: ProjectId
) {
  return {
    queryKey: qk.projectAutoCodingRules(userId, projectId),
    queryFn: () => listProjectAutoCodingRulesServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
  } as const;
}

async function invalidateProjectRuleQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
  projectId: ProjectId;
}) {
  const { qc, scopeUserId, projectId } = args;
  await Promise.all([
    qc.invalidateQueries({
      queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
    }),
    qc.invalidateQueries({
      queryKey: qk.transactions(scopeUserId, projectId),
    }),
    qc.invalidateQueries({
      queryKey: ['transactions', scopeUserId, projectId, 'page'],
    }),
    qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
  ]);
}

export function useCreateProjectAutoCodingRuleMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CreateProjectAutoCodingRuleInput) =>
      createProjectAutoCodingRuleServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () =>
      invalidateProjectRuleQueries({ qc, scopeUserId, projectId }),
  });
}

export function useUpdateProjectAutoCodingRuleMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectAutoCodingRuleUpdateInput) =>
      updateProjectAutoCodingRuleServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () =>
      invalidateProjectRuleQueries({ qc, scopeUserId, projectId }),
  });
}

export function useDeleteProjectAutoCodingRuleMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ProjectAutoCodingRule['id']) =>
      deleteProjectAutoCodingRuleServerFn({ data: { projectId, ruleId } }),
    onSuccess: async () =>
      invalidateProjectRuleQueries({ qc, scopeUserId, projectId }),
  });
}
