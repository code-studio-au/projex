import { useCallback, useMemo } from 'react';

import type { CompanyId, CompanyRole, ProjectId, UserId } from '../types';
import { can, type Action } from '../utils/auth';
import { getUserCompanyRole } from '../store/access';

import { useSessionQuery } from '../queries/session';
import { useCompanyMembershipsQuery, useAllProjectMembershipsQuery } from '../queries/memberships';

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
 * In local mode it derives permissions from seeded memberships.
 * When you migrate to a backend, these checks are still useful for
 * client-side UX gating, while the server remains the source of truth.
 */
export function useCompanyAccess(companyId: CompanyId): CompanyAccess {
  const session = useSessionQuery();
  const userId = (session.data?.userId ?? 'usr_unknown') as UserId;

  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);
  const allProjectMembershipsQ = useAllProjectMembershipsQuery(companyId);

  // Keep these references stable so downstream useMemo/useCallback dependencies
  // don't appear to change every render (eslint exhaustive-deps warning).
  const companyMemberships = useMemo(
    () => companyMembershipsQ.data ?? [],
    [companyMembershipsQ.data]
  );
  const projectMemberships = useMemo(
    () => allProjectMembershipsQ.data ?? [],
    [allProjectMembershipsQ.data]
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
        companyMemberships,
        projectMemberships,
      }),
    [userId, companyId, companyMemberships, projectMemberships]
  );

  return {
    userId,
    companyId,
    companyRole,
    isSuperadmin: companyRole === 'superadmin',
    isAdmin: companyRole === 'admin',
    isExecutive: companyRole === 'executive',
    isManagement: companyRole === 'management',
    can: canFn,
  };
}
