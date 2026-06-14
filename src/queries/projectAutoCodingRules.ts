import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProjectId } from '../types';
import type { CreateProjectAutoCodingRuleInput } from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { createProjectAutoCodingRuleServerFn } from '../server/start/functions/projectAutoCodingRules';

export function useCreateProjectAutoCodingRuleMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CreateProjectAutoCodingRuleInput) =>
      createProjectAutoCodingRuleServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: ['transactions', scopeUserId, projectId, 'page'],
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}
