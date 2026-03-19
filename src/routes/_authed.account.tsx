import { createFileRoute } from '@tanstack/react-router';

import AccountPage from '../pages/AccountPage';
import { isServerAuthMode } from './-authMode';

export const Route = createFileRoute('/_authed/account')({
  component: AccountPage,
  ssr: isServerAuthMode,
});
