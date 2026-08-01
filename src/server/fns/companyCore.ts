import type { Company, CompanyRole } from '../../types';
import { asCompanyId } from '../../types';
import { omitUndefinedProperties } from '../../utils/optionalProperties';
import { getDb } from '../db/db';

export const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

export type DbLike = ReturnType<typeof getDb>;

export function toCompany(row: {
  id: string;
  name: string;
  status: 'active' | 'deactivated';
  deactivated_at: string | null;
}): Company {
  return omitUndefinedProperties({
    id: asCompanyId(row.id),
    name: row.name,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
  });
}
