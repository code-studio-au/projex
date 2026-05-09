import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type { ImportCandidateReviewInput } from '../api/contract';
import { useApi } from '../hooks/useApi';
import type { ProjectId } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useImportCandidatesQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.importCandidates(scopeUserId, projectId),
    queryFn: () => api.listImportCandidates(projectId),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useReviewImportCandidateMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportCandidateReviewInput) =>
      api.reviewImportCandidate(projectId, input),
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
