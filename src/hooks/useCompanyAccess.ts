import { useCallback, useMemo } from 'react';

import type { CompanyId, CompanyRole, ProjectId, UserId } from '../types';
import { asUserId } from '../types';
import { can, type Action } from '../utils/auth';
import { getUserCompanyRole } from '../store/access';

import {
  useAllCompanyMembershipsQuery,
  useMyProjectMembershipsQuery,
} from '../queries/memberships';
import { useUsersQuery } from '../queries/reference';
import { useSessionQuery } from '../queries/session';

export type CompanyAccess = {
  userId: UserId;
  companyId: CompanyId;
  companyRole: CompanyRole | 'none';
  isSuperadmin: boolean;
  isAdmin: boolean;
  isExecutive: boolean;
  isManagement: boolean;
  can: (action: Action, projectId?: ProjectId) => boolean;
};

/**
 * Centralized access helper (TanStack Query-backed).
 *
 * These checks are useful for client-side UX gating while the server remains
 * the source of truth for real authorization.
 */
export function useCompanyAccess(companyId: CompanyId): CompanyAccess {
  const sessionQ = useSessionQuery();
  const userId = asUserId(sessionQ.data?.userId ?? '');
  const usersQ = useUsersQuery();

  const companyMembershipsQ = useAllCompanyMembershipsQuery();
  const myProjectMembershipsQ = useMyProjectMembershipsQuery(companyId);

  // Keep these references stable so downstream useMemo/useCallback dependencies
  // don't appear to change every render (eslint exhaustive-deps warning).
  const companyMemberships = useMemo(
    () => companyMembershipsQ.data ?? [],
    [companyMembershipsQ.data]
  );
  const projectMemberships = useMemo(
    () => myProjectMembershipsQ.data ?? [],
    [myProjectMembershipsQ.data]
  );
  const isGlobalSuperadmin = useMemo(
    () =>
      (usersQ.data ?? []).find((user) => user.id === userId)
        ?.isGlobalSuperadmin === true,
    [userId, usersQ.data]
  );

  const companyRole = useMemo(() => {
    return getUserCompanyRole(userId, companyId, companyMemberships) ?? 'none';
  }, [userId, companyId, companyMemberships]);

  const canFn = useCallback(
    (action: Action, projectId?: ProjectId) =>
      can({
        userId,
        companyId,
        projectId,
        action,
        isGlobalSuperadmin,
        companyMemberships,
        projectMemberships,
      }),
    [
      userId,
      companyId,
      isGlobalSuperadmin,
      companyMemberships,
      projectMemberships,
    ]
  );

  return {
    userId,
    companyId,
    companyRole,
    isSuperadmin: isGlobalSuperadmin,
    isAdmin: companyRole === 'admin',
    isExecutive: companyRole === 'executive',
    isManagement: companyRole === 'management',
    can: canFn,
  };
}
