import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/c/$companyId')({
  component: Outlet,
});
