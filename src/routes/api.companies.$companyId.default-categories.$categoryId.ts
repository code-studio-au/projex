import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyDefaultCategoryId, asCompanyId } from '../types';
import { deleteCompanyDefaultCategoryServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories/$categoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteCompanyDefaultCategoryServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          categoryId: asCompanyDefaultCategoryId(params.categoryId),
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
