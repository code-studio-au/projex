import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, requireApiRouteContext } from './-api-shared';
import { downloadCompanyExportJobServer } from '../server/fns/exportJobs';
import { companyExportJobIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/export-jobs/$jobId/download')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const jobId = validateOrThrow(companyExportJobIdParamSchema, params.jobId);
        const result = await downloadCompanyExportJobServer({
          context: serverContext,
          jobId,
        });

        return new Response(Buffer.from(result.bytes), {
          status: 200,
          headers: {
            'content-type': result.contentType,
            'content-disposition': `attachment; filename="${result.fileName}"`,
            'cache-control': 'no-store',
          },
        });
      },
    },
  },
});
