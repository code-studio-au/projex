import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId, asSubCategoryId } from '../types';

export const Route = createFileRoute(
  '/api/projects/$projectId/sub-categories/$subCategoryId'
)({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteSubCategory(
            asProjectId(params.projectId),
            asSubCategoryId(params.subCategoryId)
          );
          return { ok: true as const };
        }),
    },
  },
});
