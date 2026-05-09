import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../api/contract';
import { useApi } from '../hooks/useApi';
import type { CompanyId, ImportRule } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useImportRulesQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.importRules(scopeUserId, companyId),
    queryFn: () => api.listImportRules(companyId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateImportRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleCreateInput) =>
      api.createImportRule(companyId, input),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}

export function useUpdateImportRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleUpdateInput) =>
      api.updateImportRule(companyId, input),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}

export function useDeleteImportRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ImportRule['id']) =>
      api.deleteImportRule(companyId, ruleId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}
