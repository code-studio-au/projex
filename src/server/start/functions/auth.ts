import { createServerFn } from '@tanstack/react-start';

import { asUserId } from '../../../types';
import {
  getDefaultCompanyIdForUserServer,
  listCompaniesServer,
  listUsersServer,
} from '../../fns/companies';
import { startApiMiddleware } from '../middleware';

export const getSessionServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return context.session ? { userId: context.session.userId } : null;
  });

export const getPostLoginTargetServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { userId: string }) => ({
    userId: asUserId(input.userId),
  }))
  .handler(async ({ context, data }) => {
    const users = await listUsersServer({ context: context.serverContext });
    const isSuperadmin =
      users.find((user) => user.id === data.userId)?.isGlobalSuperadmin ===
      true;
    if (isSuperadmin) return { to: '/companies' as const };

    const companies = await listCompaniesServer({
      context: context.serverContext,
    });
    if (companies.length > 1) return { to: '/companies' as const };

    const companyId = await getDefaultCompanyIdForUserServer({
      context: context.serverContext,
    });
    if (companyId) {
      return {
        to: '/c/$companyId' as const,
        params: { companyId },
      };
    }

    return { to: '/companies' as const };
  });
