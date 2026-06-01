import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import {
  createImportRuleServer,
  listImportRulesServer,
  updateImportRuleServer,
} from '../server/fns/importRules';
import {
  createImportRuleInputSchema,
  updateImportRuleInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/import-rules')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listImportRulesServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createImportRuleInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createImportRuleServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateImportRuleInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateImportRuleServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
    },
  },
});
