import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({
    token: z.string().trim().optional().catch(''),
    error: z.string().trim().optional().catch(''),
  }),
  component: lazyRouteComponent(() => import('../pages/ResetPasswordPage')),
});
