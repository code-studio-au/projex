import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultCategoryServer,
  listCompanyDefaultCategoriesServer,
  updateCompanyDefaultCategoryServer,
} from '../server/fns/taxonomy';
import {
  createCompanyDefaultCategoryInputSchema,
  updateCompanyDefaultCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listCompanyDefaultCategoriesServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyDefaultCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createCompanyDefaultCategoryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateCompanyDefaultCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCompanyDefaultCategoryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
    },
  },
});
