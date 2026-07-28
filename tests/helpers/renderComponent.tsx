import type { PropsWithChildren, ReactElement } from 'react';
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export function installComponentTestDom() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
  HTMLElement.prototype.scrollIntoView = () => {};
}

export function renderComponent(element: ReactElement) {
  return render(element, {
    wrapper: ({ children }: PropsWithChildren) => (
      <MantineProvider>{children}</MantineProvider>
    ),
  });
}
