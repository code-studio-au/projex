import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { listUsersServer } from '../server/fns/companies';
import {
  cleanupSmokeFixtures,
  createSmokeFixtures,
  manualInputsToSmokeEnv,
  withTemporarySmokeEnv,
} from '../server/smoke/fixtures';
import { runSmokeSection } from '../server/smoke/runSection';
import type {
  SmokeManualInputs,
  SmokeSectionId,
  SmokeStepStreamEvent,
} from '../types';
import { smokeSectionInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

function jsonLine(event: SmokeStepStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

function smokeToolsApiEnabled() {
  return process.env.PROJEX_ENABLE_SMOKE_TOOLS === 'true';
}

export const Route = createFileRoute('/api/admin/smoke')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request }) => {
        if (!smokeToolsApiEnabled()) {
          return Response.json(
            { code: 'NOT_FOUND', message: 'Not found' },
            { status: 404 }
          );
        }

        let sectionId: SmokeSectionId;
        let mode: 'generated' | 'manual' = 'generated';
        let manualInputs: SmokeManualInputs | undefined;
        try {
          const payload = validateOrThrow(
            smokeSectionInputSchema,
            await readJsonBody(request)
          );
          sectionId = payload.sectionId;
          mode = payload.mode;
          manualInputs = payload.manualInputs;
        } catch (error) {
          if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
            return Response.json(
              { code: 'VALIDATION_ERROR', message: error.message },
              { status: 422 }
            );
          }
          return Response.json(
            { code: 'VALIDATION_ERROR', message: 'Unknown smoke section' },
            { status: 422 }
          );
        }

        const { session, serverContext } = requireApiRouteContext(context);
        if (!session?.userId) {
          return Response.json(
            { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
            { status: 401 }
          );
        }

        const users = await listUsersServer({ context: serverContext });
        const isSuperadmin =
          users.find((user) => user.id === session.userId)
            ?.isGlobalSuperadmin === true;
        if (!isSuperadmin) {
          return Response.json(
            { code: 'FORBIDDEN', message: 'Superadmin access required' },
            { status: 403 }
          );
        }

        const encoder = new TextEncoder();
        const baseUrl = new URL(request.url).origin;

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const emitStep = async (
                event: Extract<SmokeStepStreamEvent, { type: 'step' }>
              ) => {
                controller.enqueue(encoder.encode(jsonLine(event)));
              };
              const emitStatus = async (message: string) => {
                controller.enqueue(
                  encoder.encode(
                    jsonLine({
                      type: 'status',
                      sectionId,
                      message,
                    })
                  )
                );
              };

              const result =
                mode === 'generated'
                  ? await withTemporarySmokeEnv({}, async () => {
                      await emitStatus(
                        'Creating generated smoke fixtures for this run.'
                      );
                      const fixtures = await createSmokeFixtures({
                        sweepStale: true,
                        onStatus: emitStatus,
                      });
                      try {
                        return await runSmokeSection(sectionId, baseUrl, {
                          onStep: async (step) => {
                            await emitStep({
                              type: 'step',
                              sectionId,
                              step,
                            });
                          },
                          onStatus: emitStatus,
                        });
                      } finally {
                        await cleanupSmokeFixtures(fixtures, {
                          onStatus: emitStatus,
                        });
                      }
                    })
                  : await withTemporarySmokeEnv(
                      manualInputsToSmokeEnv(manualInputs),
                      async () =>
                        runSmokeSection(sectionId, baseUrl, {
                          onStep: async (step) => {
                            await emitStep({
                              type: 'step',
                              sectionId,
                              step,
                            });
                          },
                          onStatus: emitStatus,
                        })
                    );

              controller.enqueue(
                encoder.encode(
                  jsonLine({
                    type: 'result',
                    result,
                  })
                )
              );
            } catch (error) {
              const appError =
                error instanceof AppError
                  ? error
                  : new AppError(
                      'INTERNAL_ERROR',
                      error instanceof Error
                        ? error.message
                        : 'Unexpected smoke error'
                    );
              controller.enqueue(
                encoder.encode(
                  jsonLine({
                    type: 'error',
                    message: appError.message,
                  })
                )
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-store',
            'x-smoke-section': sectionId,
          },
        });
      },
    },
  },
});
