import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute('/api/projects/$projectId/categories')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'listCategoriesEndpoint',
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'createCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                createCategoryInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'updateCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                updateCategoryInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
