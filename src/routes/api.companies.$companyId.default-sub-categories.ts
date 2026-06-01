import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultSubCategoryServer,
  listCompanyDefaultSubCategoriesServer,
  updateCompanyDefaultSubCategoryServer,
} from '../server/fns/taxonomy';
import {
  createCompanyDefaultSubCategoryInputSchema,
  updateCompanyDefaultSubCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-sub-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listCompanyDefaultSubCategoriesServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyDefaultSubCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createCompanyDefaultSubCategoryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateCompanyDefaultSubCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCompanyDefaultSubCategoryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
    },
  },
});
