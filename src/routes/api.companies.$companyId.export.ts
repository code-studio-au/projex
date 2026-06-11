import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import { apiRouteMiddleware, requireApiRouteContext } from './-api-shared';
import { exportCompanyWorkbookServer } from '../server/fns/exports';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const Route = createFileRoute('/api/companies/$companyId/export')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const result = await exportCompanyWorkbookServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
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
