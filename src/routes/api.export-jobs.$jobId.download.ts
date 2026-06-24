import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  loadRouteServerExport,
  requireApiRouteContext,
} from './-api-shared';
import { companyExportJobIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/export-jobs/$jobId/download')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const jobId = validateOrThrow(
          companyExportJobIdParamSchema,
          params.jobId
        );
        const downloadCompanyExportJobServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            jobId: typeof jobId;
          }) => Promise<{
            bytes: ArrayBuffer | Uint8Array;
            contentType: string;
            fileName: string;
          }>
        >('../server/fns/exportJobs', 'downloadCompanyExportJobServer');
        const result = await downloadCompanyExportJobServer({
          context: serverContext,
          jobId,
        });
        const bodyBytes =
          result.bytes instanceof Uint8Array
            ? new Uint8Array(result.bytes).slice().buffer
            : result.bytes;

        return new Response(bodyBytes, {
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
