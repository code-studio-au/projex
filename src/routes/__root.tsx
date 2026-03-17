import type { ReactNode } from 'react';
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router';
import '@mantine/core/styles.css';
import 'mantine-react-table/styles.css';
import '../app.css';

import { RootErrorComponent, RootNotFoundComponent } from '../components/routerErrors';
import { RootLayout, RootProviders } from '../layouts';
import type { RouterContext } from '../router-context';

const env = (import.meta as unknown as { env?: Record<string, string> }).env;
const isServerMode = env?.VITE_API_MODE === 'server';

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootDocument() {
  return (
    <Document>
      <RootLayout />
    </Document>
  );
}

function RootErrorDocument(props: { error: unknown }) {
  return (
    <Document>
      <RootProviders>
        <RootErrorComponent {...props} />
      </RootProviders>
    </Document>
  );
}

function RootNotFoundDocument() {
  return (
    <Document>
      <RootProviders>
        <RootNotFoundComponent />
      </RootProviders>
    </Document>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: isServerMode ? RootDocument : RootLayout,
  errorComponent: isServerMode
    ? RootErrorDocument
    : (props) => (
        <RootProviders>
          <RootErrorComponent {...props} />
        </RootProviders>
      ),
  notFoundComponent: isServerMode
    ? RootNotFoundDocument
    : () => (
        <RootProviders>
          <RootNotFoundComponent />
        </RootProviders>
      ),
});
