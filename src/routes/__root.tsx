import type { ReactNode } from 'react';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '../app.css';

import {
  RootErrorComponent,
  RootNotFoundComponent,
} from '../components/routerErrors';
import { RootLayout, RootProviders } from '../layouts';
import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  APP_DEFAULT_COLOR_SCHEME,
} from '../colorScheme';
import type { RouterContext } from '../router-context';

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        {/* CSP middleware replaces this browser-redacted nonce placeholder. */}
        <ColorSchemeScript
          defaultColorScheme={APP_DEFAULT_COLOR_SCHEME}
          localStorageKey={APP_COLOR_SCHEME_STORAGE_KEY}
          nonce=""
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
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
      <RootProviders>
        <RootLayout />
      </RootProviders>
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
  component: RootDocument,
  errorComponent: RootErrorDocument,
  notFoundComponent: RootNotFoundDocument,
});
