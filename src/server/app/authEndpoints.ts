import { AppError } from '../../api/errors';
import { defineAppEndpoint, noInputSchema } from './shared';
import {
  getDefaultCompanyIdForUserEndpoint,
  listCompaniesEndpoint,
  listUsersEndpoint,
} from './companyEndpoints';

export const getSessionEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: async ({ context }) => {
    if (typeof context.session === 'undefined') {
      throw new AppError('INTERNAL_ERROR', 'Missing request session context');
    }
    return context.session;
  },
});

export const getPostLoginTargetEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: async ({ context }) => {
    const users = await listUsersEndpoint.execute({
      context,
      input: undefined,
    });
    const isSuperadmin =
      users.find((user) => user.id === context.session?.userId)
        ?.isGlobalSuperadmin === true;
    if (isSuperadmin) return { to: '/companies' as const };

    const companies = await listCompaniesEndpoint.execute({
      context,
      input: undefined,
    });
    if (companies.length > 1) return { to: '/companies' as const };

    const companyId = await getDefaultCompanyIdForUserEndpoint.execute({
      context,
      input: undefined,
    });
    if (companyId) {
      return {
        to: '/c/$companyId' as const,
        params: { companyId },
      };
    }

    return { to: '/companies' as const };
  },
});
