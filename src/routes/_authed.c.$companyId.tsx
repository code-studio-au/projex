import { Outlet, createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/c/$companyId')({
  component: Outlet,
  ssr: isServerAuthMode,
});
