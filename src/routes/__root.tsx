import { createRootRouteWithContext } from '@tanstack/react-router';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '../app.css';

import RootDocument from '../components/rootRoute/RootDocument';
import RootErrorDocument from '../components/rootRoute/RootErrorDocument';
import RootNotFoundDocument from '../components/rootRoute/RootNotFoundDocument';
import type { RouterContext } from '../router-context';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  errorComponent: RootErrorDocument,
  notFoundComponent: RootNotFoundDocument,
});
