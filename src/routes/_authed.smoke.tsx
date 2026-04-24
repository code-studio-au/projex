import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router';

import { RootNotFoundComponent } from '../components/routerErrors';
import { isServerAuthMode } from './-authMode';

const smokeToolsEnabled = import.meta.env.VITE_ENABLE_SMOKE_TOOLS === 'true';

export const Route = createFileRoute('/_authed/smoke')({
  beforeLoad: () => {
    if (!smokeToolsEnabled) {
      throw notFound();
    }
  },
  component: smokeToolsEnabled
    ? lazyRouteComponent(() => import('../pages/SmokeDashboardPage'))
    : RootNotFoundComponent,
  ssr: isServerAuthMode,
});
