import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import {
  deleteCompanyServer,
  getCompanyServer,
  updateCompanyServer,
} from '../server/fns/companies';
import {
  deleteCompanyBodySchema,
  updateCompanyBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await getCompanyServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateCompanyBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCompanyServer({
            context: serverContext,
            input: {
              id: asCompanyId(params.companyId),
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          deleteCompanyBodySchema,
          await readJsonBody(request)
        );
        await deleteCompanyServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          confirmation: body.confirmation,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
