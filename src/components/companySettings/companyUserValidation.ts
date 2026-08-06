const EXISTING_COMPANY_USER_EMAIL_ERROR =
  'This email already belongs to a company user. Use the Users table to change their role or resend their invite.';

export function validateNewCompanyUserEmail(
  email: string,
  companyUsers: readonly { email: string }[]
): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const alreadyBelongsToCompany = companyUsers.some(
    (user) => user.email.trim().toLowerCase() === normalizedEmail
  );

  return alreadyBelongsToCompany ? EXISTING_COMPANY_USER_EMAIL_ERROR : null;
}
