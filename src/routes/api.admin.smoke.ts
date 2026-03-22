import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { runSmokeSection } from '../server/smoke/runSection';
import type { SmokeSectionId } from '../types';
import { withApi } from './-api-shared';

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

export const Route = createFileRoute('/api/admin/smoke')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        return withApi(request, async (api) => {
          const session = await api.getSession();
          if (!session?.userId) throw new AppError('UNAUTHENTICATED', 'Not authenticated');

          const memberships = await api.listAllCompanyMemberships();
          const isSuperadmin = memberships.some(
            (membership) => membership.userId === session.userId && membership.role === 'superadmin'
          );
          if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Superadmin access required');

          const sectionId = body && typeof body === 'object' ? (body as { sectionId?: unknown }).sectionId : null;
          if (!isSmokeSectionId(sectionId)) {
            throw new AppError('VALIDATION_ERROR', 'Unknown smoke section');
          }

          return runSmokeSection(sectionId, new URL(request.url).origin);
        });
      },
    },
  },
});
