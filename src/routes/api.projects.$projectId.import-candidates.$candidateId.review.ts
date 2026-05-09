import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asImportCandidateId, asProjectId } from '../types';
import { importCandidateReviewMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates/$candidateId/review'
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            importCandidateReviewMutationBodySchema,
            await readJsonBody(request)
          );
          return api.reviewImportCandidate(asProjectId(params.projectId), {
            ...body.review,
            candidateId: asImportCandidateId(params.candidateId),
          });
        }),
    },
  },
});
