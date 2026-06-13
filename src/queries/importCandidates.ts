import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { ImportCandidateReviewInput } from '../api/contract';
import type { ProjectId } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  listImportCandidatesServerFn,
  reviewImportCandidateServerFn,
} from '../server/start/functions/importReads';

export function useImportCandidatesQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    importCandidatesQueryOptions(scopeUserId, projectId, options)
  );
}

export function importCandidatesQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.importCandidates(userId, projectId),
    queryFn: () => listImportCandidatesServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useReviewImportCandidateMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportCandidateReviewInput) =>
      reviewImportCandidateServerFn({ data: { projectId, payload: input } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.importCandidates(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]),
  });
}
