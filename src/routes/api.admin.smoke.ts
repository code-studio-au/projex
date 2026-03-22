import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { createStartServerApi } from '../server/api/startBridge';
import { runSmokeSection } from '../server/smoke/runSection';
import type { SmokeSectionId, SmokeStepStreamEvent } from '../types';

function isSmokeSectionId(value: unknown): value is SmokeSectionId {
  return (
    value === 'basics' ||
    value === 'appPages' ||
    value === 'emailChange' ||
    value === 'temporaryData' ||
    value === 'inviteFlow' ||
    value === 'privacyChecks'
  );
}

function jsonLine(event: SmokeStepStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export const Route = createFileRoute('/api/admin/smoke')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const sectionId =
          body && typeof body === 'object' ? (body as { sectionId?: unknown }).sectionId : null;
        if (!isSmokeSectionId(sectionId)) {
          return Response.json(
            { code: 'VALIDATION_ERROR', message: 'Unknown smoke section' },
            { status: 422 }
          );
        }

        const api = await createStartServerApi({ request });
        const session = await api.getSession();
        if (!session?.userId) {
          return Response.json(
            { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
            { status: 401 }
          );
        }

        const memberships = await api.listAllCompanyMemberships();
        const isSuperadmin = memberships.some(
          (membership) => membership.userId === session.userId && membership.role === 'superadmin'
        );
        if (!isSuperadmin) {
          return Response.json(
            { code: 'FORBIDDEN', message: 'Superadmin access required' },
            { status: 403 }
          );
        }

        const encoder = new TextEncoder();
        const origin = new URL(request.url).origin;

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const result = await runSmokeSection(sectionId, origin, {
                onStep: async (step) => {
                  controller.enqueue(
                    encoder.encode(
                      jsonLine({
                        type: 'step',
                        sectionId,
                        step,
                      })
                    )
                  );
                },
              });

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
                      error instanceof Error ? error.message : 'Unexpected smoke error'
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
