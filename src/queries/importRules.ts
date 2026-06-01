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
import type { CompanyId, ImportRule } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  createImportRuleServerFn,
  deleteImportRuleServerFn,
  listImportRulesServerFn,
  updateImportRuleServerFn,
} from '../server/start/functions/importReads';

export function useImportRulesQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.importRules(scopeUserId, companyId),
    queryFn: () => listImportRulesServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleCreateInput) =>
      createImportRuleServerFn({ data: { companyId, payload: input } }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}

export function useUpdateImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleUpdateInput) =>
      updateImportRuleServerFn({ data: { companyId, payload: input } }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}

export function useDeleteImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ImportRule['id']) =>
      deleteImportRuleServerFn({ data: { companyId, ruleId } }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.importRules(scopeUserId, companyId),
      }),
  });
}
