import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CompanyId, ProjectId, Txn, UserId } from '../types';
import type {
  CompanyCreateInput,
  CompanyCreateResult,
  CreateCompanyUserInput,
  CompanyUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  TxnImportInput,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { withStandardTxnAccountingMetadata } from '../utils/transactions';
import {
  createCompanyServerFn,
  createProjectServerFn,
  createUserInCompanyServerFn,
  deactivateCompanyServerFn,
  deactivateProjectServerFn,
  deleteCompanyServerFn,
  deleteProjectServerFn,
  importTransactionsServerFn,
  reactivateCompanyServerFn,
  reactivateProjectServerFn,
  sendCompanyUserInviteEmailServerFn,
  updateCompanyServerFn,
  updateProjectServerFn,
} from '../server/start/functions/admin';

export function useCreateCompanyMutation() {
  const qc = useQueryClient();
  return useMutation<CompanyCreateResult, Error, CompanyCreateInput>({
    mutationFn: (input) => createCompanyServerFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
    },
  });
}

export function useCreateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      createProjectServerFn({ data: { companyId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useUpdateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectUpdateInput) =>
      updateProjectServerFn({ data: input }),
    onSuccess: async (_, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, vars.id) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.myProjectMemberships(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useUpdateCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyUpdateInput) =>
      updateCompanyServerFn({ data: input }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, vars.id) });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
    },
  });
}

export function useCreateUserInCompanyMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (vars: CreateCompanyUserInput) =>
      createUserInCompanyServerFn({
        data: { companyId, payload: vars },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
      });
      qc.invalidateQueries({
        queryKey: qk.companyMemberships(scopeUserId, companyId),
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useSendCompanyUserInviteEmailMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (userId: UserId) =>
      sendCompanyUserInviteEmailServerFn({
        data: { companyId, userId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
      });
      qc.invalidateQueries({
        queryKey: qk.companyMemberships(scopeUserId, companyId),
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useImportTransactionsMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const transactionQueryKey = qk.transactions(scopeUserId, projectId);
  const budgetQueryKey = qk.budgets(scopeUserId, projectId);
  return useMutation({
    mutationFn: (vars: TxnImportInput) =>
      importTransactionsServerFn({ data: { projectId, payload: vars } }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: transactionQueryKey });
      const previous = qc.getQueryData<Txn[]>(transactionQueryKey);
      const optimisticTxns = vars.txns.map(withStandardTxnAccountingMetadata);
      qc.setQueryData<Txn[]>(
        transactionQueryKey,
        vars.mode === 'replaceAll'
          ? optimisticTxns
          : [...(previous ?? []), ...optimisticTxns]
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous)
        qc.setQueryData(transactionQueryKey, context.previous);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: transactionQueryKey }),
        qc.invalidateQueries({ queryKey: budgetQueryKey }),
        qc.invalidateQueries({
          queryKey: qk.importCandidates(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useDeactivateCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) =>
      deactivateCompanyServerFn({ data: { companyId } }),
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
    },
  });
}

export function useReactivateCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) =>
      reactivateCompanyServerFn({ data: { companyId } }),
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useDeleteCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: { companyId: CompanyId; confirmation: string }) =>
      deleteCompanyServerFn({ data: input }),
    onSuccess: (_, input) => {
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
      qc.invalidateQueries({
        queryKey: qk.company(scopeUserId, input.companyId),
      });
      qc.invalidateQueries({
        queryKey: qk.projects(scopeUserId, input.companyId),
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
      });
    },
  });
}

export function useDeactivateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) =>
      deactivateProjectServerFn({ data: { projectId } }),
    onSuccess: async (_, projectId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useReactivateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) =>
      reactivateProjectServerFn({ data: { projectId } }),
    onSuccess: async (_, projectId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useDeleteProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: { projectId: ProjectId; confirmation: string }) =>
      deleteProjectServerFn({ data: input }),
    onSuccess: async (_, input) => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.project(scopeUserId, input.projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
      ]);
    },
  });
}
