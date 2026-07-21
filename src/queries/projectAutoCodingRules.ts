import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { ProjectAutoCodingRule, ProjectId } from '../types';
import type {
  BackfillProjectCodingInput,
  CreateProjectAutoCodingRuleInput,
  ProjectAutoCodingRuleUpdateInput,
  PromoteProjectRuleToCompanyDefaultInput,
} from '../api/types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { invalidateProjectTransactionQueries } from './transactions';
import {
  backfillProjectCodingServerFn,
  createProjectAutoCodingRuleServerFn,
  deleteProjectAutoCodingRuleServerFn,
  listProjectAutoCodingRulesServerFn,
  promoteProjectRuleToCompanyDefaultServerFn,
  updateProjectAutoCodingRuleServerFn,
} from '../server/start/functions/projectAutoCodingRules';

export function useProjectAutoCodingRulesQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(projectAutoCodingRulesQueryOptions(scopeUserId, projectId));
}

function projectAutoCodingRulesQueryOptions(
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
    invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
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

export function useBackfillProjectCodingMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BackfillProjectCodingInput) =>
      backfillProjectCodingServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () =>
      invalidateProjectRuleQueries({ qc, scopeUserId, projectId }),
  });
}

export function usePromoteProjectRuleToCompanyDefaultMutation(
  projectId: ProjectId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: PromoteProjectRuleToCompanyDefaultInput) =>
      promoteProjectRuleToCompanyDefaultServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () => {
      await invalidateProjectRuleQueries({ qc, scopeUserId, projectId });
      await qc.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('companyDefault'),
      });
    },
  });
}
