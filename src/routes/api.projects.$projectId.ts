import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  deleteProjectBodySchema,
  updateProjectBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.getProject(asProjectId(params.projectId))
        ),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateProjectBodySchema,
            await readJsonBody(request)
          );
          return api.updateProject({
            id: asProjectId(params.projectId),
            ...body,
          });
        }),
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            deleteProjectBodySchema,
            await readJsonBody(request)
          );
          await api.deleteProject({
            projectId: asProjectId(params.projectId),
            confirmation: body.confirmation,
          });
          return { ok: true as const };
        }),
    },
  },
});
