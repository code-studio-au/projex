import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, jsonApi, requireApiRouteContext } from './-api-shared';
import { getCompanyExportJobServer } from '../server/fns/exportJobs';
import { companyExportJobIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/export-jobs/$jobId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const jobId = validateOrThrow(companyExportJobIdParamSchema, params.jobId);
        const job = await getCompanyExportJobServer({
          context: serverContext,
          jobId,
        });
        return jsonApi(job, { status: 200 });
      },
    },
  },
});
