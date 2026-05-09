import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId } from '../types';
import {
  createImportRuleInputSchema,
  updateImportRuleInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/import-rules')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listImportRules(asCompanyId(params.companyId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createImportRuleInputSchema,
            await readJsonBody(request)
          );
          return api.createImportRule(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateImportRuleInputSchema,
            await readJsonBody(request)
          );
          return api.updateImportRule(asCompanyId(params.companyId), body);
        }),
    },
  },
});
