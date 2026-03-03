import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCategoryId, asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/categories/$categoryId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteCategory(
            asProjectId(params.projectId),
            asCategoryId(params.categoryId)
          );
          return { ok: true as const };
        }),
    },
  },
});
