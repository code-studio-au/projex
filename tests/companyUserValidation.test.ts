import { describe, expect, it } from 'vitest';

import { validateNewCompanyUserEmail } from '../src/components/companySettings/companyUserValidation';

describe('validateNewCompanyUserEmail', () => {
  const companyUsers = [
    { email: 'admin@example.com' },
    { email: 'member@example.com' },
  ];

  it('rejects an existing company email without case or whitespace gaps', () => {
    expect(
      validateNewCompanyUserEmail('  MEMBER@EXAMPLE.COM ', companyUsers)
    ).toBe(
      'This email already belongs to a company user. Use the Users table to change their role or resend their invite.'
    );
  });

  it('allows an email that is not already in the company', () => {
    expect(
      validateNewCompanyUserEmail('new-user@example.com', companyUsers)
    ).toBeNull();
  });
});
