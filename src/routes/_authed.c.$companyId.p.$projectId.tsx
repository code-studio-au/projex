import { createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import ProjectWorkspacePage from '../pages/ProjectWorkspacePage';

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  component: ProjectWorkspacePage,
  ssr: isServerAuthMode,
});
