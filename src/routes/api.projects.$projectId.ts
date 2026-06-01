import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import {
  deleteProjectServer,
  getProjectServer,
  updateProjectServer,
} from '../server/fns/projects';
import {
  deleteProjectBodySchema,
  updateProjectBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await getProjectServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateProjectBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateProjectServer({
            context: serverContext,
            input: {
              id: asProjectId(params.projectId),
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          deleteProjectBodySchema,
          await readJsonBody(request)
        );
        await deleteProjectServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          confirmation: body.confirmation,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
