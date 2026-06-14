import { createServerFn } from '@tanstack/react-start';

import { getDb } from '../../db/db';
import {
  getDefaultCompanyIdForUserServer,
  listCompaniesServer,
  listUsersServer,
} from '../../fns/companies';
import { startApiMiddleware } from '../middleware';

export const getSessionServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    if (!context.session?.userId) return null;

    const user = await getDb()
      .selectFrom('users')
      .select(['id', 'disabled'])
      .where('id', '=', context.session.userId)
      .executeTakeFirst();
    if (!user || user.disabled) return null;

    return { userId: context.session.userId };
  });

export const getPostLoginTargetServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    const users = await listUsersServer({ context: context.serverContext });
    const isSuperadmin =
      users.find((user) => user.id === context.session?.userId)
        ?.isGlobalSuperadmin === true;
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
