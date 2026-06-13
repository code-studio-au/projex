import { createServerFn } from '@tanstack/react-start';

import {
  getDefaultCompanyIdForUserServer,
  listCompaniesServer,
  listUsersServer,
} from '../../fns/companies';
import { startApiMiddleware } from '../middleware';

export const listUsersServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return listUsersServer({ context: context.serverContext });
  });

export const listCompaniesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return listCompaniesServer({ context: context.serverContext });
  });

export const getDefaultCompanyIdForUserServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return getDefaultCompanyIdForUserServer({
      context: context.serverContext,
    });
  });
