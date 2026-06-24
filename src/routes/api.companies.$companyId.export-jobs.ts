import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { createCompanyExportJobBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/export-jobs')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const getLatestCompanyExportJobServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            companyId: ReturnType<typeof asCompanyId>;
          }) => Promise<unknown>
        >('../server/fns/exportJobs', 'getLatestCompanyExportJobServer');
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
        const createCompanyExportJobServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            companyId: ReturnType<typeof asCompanyId>;
            options: {
              scope: string;
              detail: string;
              fromDate: string | undefined;
              toDate: string | undefined;
              notifyWhenReady: boolean;
            };
          }) => Promise<unknown>
        >('../server/fns/exportJobs', 'createCompanyExportJobServer');
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
