import { createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import CompanyDashboardPage from '../pages/CompanyDashboardPage';

export const Route = createFileRoute('/_authed/c/$companyId/')({
  component: CompanyDashboardPage,
  ssr: isServerAuthMode,
});
