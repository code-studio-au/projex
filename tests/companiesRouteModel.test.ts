import { describe, expect, test } from 'vitest';

import { getSingleCompanyRedirectId } from '../src/routes/-companiesRouteModel';
import { asCompanyId, asUserId, type CompanyMembership } from '../src/types';

const userId = asUserId('user-1');
const otherUserId = asUserId('user-2');
const companyId = asCompanyId('company-1');

function membership(
  overrides: Partial<CompanyMembership> = {}
): CompanyMembership {
  return {
    companyId,
    userId,
    role: 'member',
    ...overrides,
  };
}

describe('companies route redirect model', () => {
  test('redirects a regular user with exactly one company membership', () => {
    expect(
      getSingleCompanyRedirectId({
        userId,
        isSuperadmin: false,
        memberships: [
          membership(),
          membership({ userId: otherUserId, companyId: asCompanyId('other') }),
        ],
      })
    ).toBe(companyId);
  });

  test('keeps superadmins and multi-company users on the companies route', () => {
    const memberships = [
      membership(),
      membership({ companyId: asCompanyId('company-2') }),
    ];

    expect(
      getSingleCompanyRedirectId({
        userId,
        isSuperadmin: false,
        memberships,
      })
    ).toBeNull();
    expect(
      getSingleCompanyRedirectId({
        userId,
        isSuperadmin: true,
        memberships: [membership()],
      })
    ).toBeNull();
  });
});
