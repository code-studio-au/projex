import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import { apiRouteMiddleware, requireApiRouteContext } from './-api-shared';
import { exportCompanyWorkbookServer } from '../server/fns/exports';
import { companyExportQuerySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const Route = createFileRoute('/api/companies/$companyId/export')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params, request }) => {
        const { serverContext } = requireApiRouteContext(context);
        const requestUrl = new URL(request.url);
        const query = validateOrThrow(
          companyExportQuerySchema,
          Object.fromEntries(requestUrl.searchParams.entries())
        );
        const result = await exportCompanyWorkbookServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          options: {
            scope: query.scope ?? 'all',
            detail: query.detail ?? 'full',
            fromDate: query.from,
            toDate: query.to,
          },
        });

        return new Response(Buffer.from(result.bytes), {
          status: 200,
          headers: {
            'content-type': XLSX_CONTENT_TYPE,
            'content-disposition': `attachment; filename="${result.fileName}"`,
            'cache-control': 'no-store',
          },
        });
      },
    },
  },
});
