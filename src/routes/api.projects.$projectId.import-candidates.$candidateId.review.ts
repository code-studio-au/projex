import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

import { importCandidateReviewMutationBodySchema } from '../validation/apiSchemas';

import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates/$candidateId/review'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        const body = validateOrThrow(
          importCandidateReviewMutationBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/importEndpoints',
            exportName: 'reviewImportCandidateEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: {
                candidateId: params.candidateId,
                decision: body.review.decision,
              },
            },
          })
        );
      },
    },
  },
});
