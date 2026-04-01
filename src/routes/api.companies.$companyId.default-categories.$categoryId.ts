import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyDefaultCategoryId, asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-categories/$categoryId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteCompanyDefaultCategory(
            asCompanyId(params.companyId),
            asCompanyDefaultCategoryId(params.categoryId)
          );

          return { ok: true as const };
        }),
    },
  },
});
