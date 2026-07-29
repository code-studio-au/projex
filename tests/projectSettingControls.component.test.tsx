// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ProjectSettingControls from '../src/components/settings/ProjectSettingControls';
import { asProjectId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function defaultProps() {
  return {
    projectType: 'project' as const,
    parentProjectId: asProjectId('prj_programme'),
    currency: 'AUD' as const,
    visibility: 'private' as const,
    allowSuperadminAccess: true,
    syncCompanyDefaults: false,
    allowTxnTransfers: false,
    programmeOptions: [
      {
        value: asProjectId('prj_programme'),
        label: 'Programme Alpha',
      },
    ],
    canEditProject: true,
    canEditCompanyStructure: true,
    canManageTransferCapability: true,
    isMobile: false,
    onSaveStructure: vi.fn().mockResolvedValue(undefined),
    onSaveCurrency: vi.fn().mockResolvedValue(undefined),
    onSaveVisibility: vi.fn().mockResolvedValue(undefined),
    onSaveSuperadminAccess: vi.fn().mockResolvedValue(undefined),
    onSuperadminAccessSaved: vi.fn(),
    onSaveSyncCompanyDefaults: vi.fn().mockResolvedValue(undefined),
    onSaveAllowTxnTransfers: vi.fn().mockResolvedValue(undefined),
  };
}

function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('ProjectSettingControls', () => {
  it('keeps coupled structure changes local and disables only that group during save', async () => {
    const save = deferred();
    const props = defaultProps();
    props.onSaveStructure = vi.fn(() => save.promise);
    renderComponent(<ProjectSettingControls {...props} />);

    selectOption('Type', 'Programme (reporting only)');
    expect(props.onSaveStructure).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save project structure' })
    );

    expect(props.onSaveStructure).toHaveBeenCalledWith({
      projectType: 'programme',
      parentProjectId: null,
    });
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Type',
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('switch', {
          name: /^Sync company standards/,
        }) as HTMLInputElement
      ).disabled
    ).toBe(false);
    expect(screen.getByRole('status').textContent).toContain(
      'Saving project structure'
    );

    save.resolve();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Project structure saved'
      )
    );
  });

  it('retains an explicit visibility draft after rejection and retries it', async () => {
    const props = defaultProps();
    props.onSaveVisibility = vi
      .fn()
      .mockRejectedValueOnce(new Error('Visibility update was rejected'))
      .mockResolvedValueOnce(undefined);
    renderComponent(<ProjectSettingControls {...props} />);

    selectOption('Visibility', 'Company-wide (visible to all company users)');
    expect(props.onSaveVisibility).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Visibility update was rejected'
    );
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Visibility',
        }) as HTMLInputElement
      ).value
    ).toBe('Company-wide (visible to all company users)');

    fireEvent.click(screen.getByRole('button', { name: 'Retry visibility' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Visibility saved'
      )
    );
    expect(props.onSaveVisibility).toHaveBeenCalledTimes(2);
    expect(props.onSaveVisibility).toHaveBeenNthCalledWith(1, 'company');
    expect(props.onSaveVisibility).toHaveBeenNthCalledWith(2, 'company');
  });

  it('shows pending auto-save state without blocking unrelated settings', async () => {
    const save = deferred();
    const props = defaultProps();
    props.onSaveSyncCompanyDefaults = vi.fn(() => save.promise);
    renderComponent(<ProjectSettingControls {...props} />);

    const syncSwitch = screen.getByRole('switch', {
      name: /^Sync company standards/,
    }) as HTMLInputElement;
    fireEvent.click(syncSwitch);

    expect(props.onSaveSyncCompanyDefaults).toHaveBeenCalledWith(true);
    expect(syncSwitch.checked).toBe(true);
    expect(syncSwitch.disabled).toBe(true);
    expect(
      (
        screen.getByRole('switch', {
          name: /^Allow transaction transfers out/,
        }) as HTMLInputElement
      ).disabled
    ).toBe(false);
    expect(screen.getByRole('status').textContent).toContain(
      'Saving sync company standards'
    );

    save.resolve();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Sync company standards saved'
      )
    );
  });

  it('rolls back a rejected auto-save and retries the intended value', async () => {
    const props = defaultProps();
    props.onSaveSyncCompanyDefaults = vi
      .fn()
      .mockRejectedValueOnce(new Error('Standards service unavailable'))
      .mockResolvedValueOnce(undefined);
    renderComponent(<ProjectSettingControls {...props} />);

    const syncSwitch = screen.getByRole('switch', {
      name: /^Sync company standards/,
    }) as HTMLInputElement;
    fireEvent.click(syncSwitch);

    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Standards service unavailable');
    expect(error.textContent).toContain('The previous value was restored');
    expect(syncSwitch.getAttribute('aria-describedby')?.split(' ')).toContain(
      error.parentElement?.id
    );
    expect(syncSwitch.checked).toBe(false);
    expect(syncSwitch.disabled).toBe(false);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry sync company standards',
      })
    );
    await waitFor(() => expect(syncSwitch.checked).toBe(true));
    expect(props.onSaveSyncCompanyDefaults).toHaveBeenCalledTimes(2);
    expect(props.onSaveSyncCompanyDefaults).toHaveBeenNthCalledWith(1, true);
    expect(props.onSaveSyncCompanyDefaults).toHaveBeenNthCalledWith(2, true);
  });

  it('keeps confirmation open with an accessible retry after a rejected access change', async () => {
    const props = defaultProps();
    props.onSaveSuperadminAccess = vi
      .fn()
      .mockRejectedValueOnce(new Error('Access update denied'))
      .mockResolvedValueOnce(undefined);
    renderComponent(<ProjectSettingControls {...props} />);

    fireEvent.click(
      screen.getByRole('switch', { name: /^Allow superadmin access/ })
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Disable superadmin access',
      })
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Access update denied'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry disable superadmin access',
      })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'Disable superadmin access',
        })
      ).toBeNull()
    );
    expect(props.onSaveSuperadminAccess).toHaveBeenCalledTimes(2);
    expect(props.onSuperadminAccessSaved).toHaveBeenCalledWith(false);
  });
});
