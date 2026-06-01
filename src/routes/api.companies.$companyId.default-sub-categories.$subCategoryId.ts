import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyDefaultSubCategoryId, asCompanyId } from '../types';
import { deleteCompanyDefaultSubCategoryServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-sub-categories/$subCategoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
          const { serverContext } = requireApiRouteContext(context);
          await deleteCompanyDefaultSubCategoryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            subCategoryId: asCompanyDefaultSubCategoryId(params.subCategoryId),
          });

          return jsonApi({ ok: true as const });
        },
    },
  },
});
