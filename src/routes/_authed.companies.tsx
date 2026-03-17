import { createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import LandingPage from '../pages/LandingPage';

export const Route = createFileRoute('/_authed/companies')({
  component: LandingPage,
  ssr: isServerAuthMode,
});
