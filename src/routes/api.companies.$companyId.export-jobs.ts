import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import {
  createCompanyExportJobServer,
  getLatestCompanyExportJobServer,
} from '../server/fns/exportJobs';
import { createCompanyExportJobBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/export-jobs')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const job = await getLatestCompanyExportJobServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
        });
        return jsonApi(job, { status: 200 });
      },
      POST: async ({ context, params, request }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyExportJobBodySchema,
          await readJsonBody(request)
        );
        const job = await createCompanyExportJobServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          options: {
            scope: body.scope ?? 'all',
            detail: body.detail ?? 'full',
            fromDate: body.from,
            toDate: body.to,
            notifyWhenReady: body.notifyWhenReady ?? false,
          },
        });
        return jsonApi(job, { status: 202 });
      },
    },
  },
});
