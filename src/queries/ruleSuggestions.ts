import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyId } from '../types';
import type {
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
} from '../api/types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  acceptRuleSuggestionServerFn,
  dismissRuleSuggestionServerFn,
  listRuleSuggestionsServerFn,
} from '../server/start/functions/ruleSuggestionReads';

export function useRuleSuggestionsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.ruleSuggestions(scopeUserId, companyId),
    queryFn: () => listRuleSuggestionsServerFn({ data: { companyId } }),
  });
}

export function useAcceptRuleSuggestionMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: RuleSuggestionAcceptInput) =>
      acceptRuleSuggestionServerFn({ data: { companyId, payload: input } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.ruleSuggestions(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useDismissRuleSuggestionMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: RuleSuggestionDismissInput) =>
      dismissRuleSuggestionServerFn({ data: { companyId, payload: input } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.ruleSuggestions(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]),
  });
}
