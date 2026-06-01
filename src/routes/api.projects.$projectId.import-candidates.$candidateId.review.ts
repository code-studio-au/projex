import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { reviewImportCandidateServer } from '../server/fns/transactions';
import { asImportCandidateId, asProjectId } from '../types';
import { importCandidateReviewMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates/$candidateId/review'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          importCandidateReviewMutationBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await reviewImportCandidateServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            candidateId: asImportCandidateId(params.candidateId),
            decision: body.review.decision,
          })
        );
      },
    },
  },
});
