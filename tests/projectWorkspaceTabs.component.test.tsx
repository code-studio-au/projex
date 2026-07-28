// @vitest-environment jsdom

import { useState } from 'react';
import { Tabs } from '@mantine/core';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import ProjectWorkspaceTabList from '../src/components/ProjectWorkspaceTabList';
import {
  resolveProjectWorkspaceTabAccess,
  type ProjectWorkspaceTab,
} from '../src/components/projectWorkspaceTabAccess';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function TabHarness(props: { canImport: boolean; canProjectEdit: boolean }) {
  const [activeTab, setActiveTab] =
    useState<ProjectWorkspaceTab>('transactions');

  return (
    <Tabs
      value={activeTab}
      onChange={(value) => setActiveTab(value as ProjectWorkspaceTab)}
    >
      <ProjectWorkspaceTabList {...props} />
    </Tabs>
  );
}

describe('ProjectWorkspaceTabList', () => {
  it('keeps tab state controlled while enforcing permission boundaries', () => {
    renderComponent(<TabHarness canImport={false} canProjectEdit={false} />);

    expect(
      screen
        .getByRole('tab', { name: 'Transactions' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(
      (screen.getByRole('tab', { name: 'Import' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('tab', { name: 'Settings' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Budget' }));

    expect(
      screen.getByRole('tab', { name: 'Budget' }).getAttribute('aria-selected')
    ).toBe('true');
  });

  it('does not trust client-only permissions before hydration', () => {
    const serverAccess = resolveProjectWorkspaceTabAccess({
      isHydrated: false,
      isOperationalProject: true,
      initialCanImport: false,
      initialCanProjectEdit: false,
      liveCanImport: true,
      liveCanProjectEdit: true,
    });
    const hydratedAccess = resolveProjectWorkspaceTabAccess({
      isHydrated: true,
      isOperationalProject: true,
      initialCanImport: false,
      initialCanProjectEdit: false,
      liveCanImport: true,
      liveCanProjectEdit: true,
    });

    const view = renderComponent(<TabHarness {...serverAccess} />);
    expect(
      (screen.getByRole('tab', { name: 'Import' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('tab', { name: 'Settings' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    view.rerender(<TabHarness {...hydratedAccess} />);
    expect(
      (screen.getByRole('tab', { name: 'Import' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(
      (screen.getByRole('tab', { name: 'Settings' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('never enables import for a programme workspace', () => {
    expect(
      resolveProjectWorkspaceTabAccess({
        isHydrated: true,
        isOperationalProject: false,
        initialCanImport: true,
        initialCanProjectEdit: true,
        liveCanImport: true,
        liveCanProjectEdit: true,
      })
    ).toEqual({ canImport: false, canProjectEdit: true });
  });
});
