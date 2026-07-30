import type { ReactNode } from 'react';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import { HeadContent, Scripts } from '@tanstack/react-router';

import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  APP_DEFAULT_COLOR_SCHEME,
} from '../../colorScheme';

export default function Document({ children }: { children: ReactNode }) {
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
