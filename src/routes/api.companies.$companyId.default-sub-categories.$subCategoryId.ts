import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyDefaultSubCategoryId, asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-sub-categories/$subCategoryId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, (api) =>
          api.deleteCompanyDefaultSubCategory(
            asCompanyId(params.companyId),
            asCompanyDefaultSubCategoryId(params.subCategoryId)
          )
        ),
    },
  },
});
