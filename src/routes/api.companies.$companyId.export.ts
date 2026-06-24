import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import {
  apiRouteMiddleware,
  loadRouteServerExport,
  requireApiRouteContext,
} from './-api-shared';
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
        const exportCompanyWorkbookServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            companyId: ReturnType<typeof asCompanyId>;
            options: {
              scope: string;
              detail: string;
              fromDate: string | undefined;
              toDate: string | undefined;
            };
          }) => Promise<{ bytes: ArrayBuffer | Uint8Array; fileName: string }>
        >('../server/fns/exports', 'exportCompanyWorkbookServer');
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
        const bodyBytes =
          result.bytes instanceof Uint8Array
            ? new Uint8Array(result.bytes).slice().buffer
            : result.bytes;

        return new Response(bodyBytes, {
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
