import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  requireApiRouteContext,
} from './-api-shared';
import { companyExportJobIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/export-jobs/$jobId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const jobId = validateOrThrow(
          companyExportJobIdParamSchema,
          params.jobId
        );
        const getCompanyExportJobServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            jobId: typeof jobId;
          }) => Promise<unknown>
        >('../server/fns/exportJobs', 'getCompanyExportJobServer');
        const job = await getCompanyExportJobServer({
          context: serverContext,
          jobId,
        });
        return jsonApi(job, { status: 200 });
      },
    },
  },
});
