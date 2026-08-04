// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import AccessRemovalButton from '../src/components/access/AccessRemovalButton';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

describe('AccessRemovalButton', () => {
  it('explains the consequence and requires explicit confirmation', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderComponent(
      <AccessRemovalButton
        userLabel="Alex Example"
        scopeLabel="this project"
        consequence="Alex will lose explicit project access."
        isPending={false}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(
      'Remove Alex Example from this project?'
    );
    expect(dialog.textContent).toContain(
      'Alex will lose explicit project access.'
    );
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
  });

  it('keeps a protected final-owner removal unavailable with its reason', () => {
    renderComponent(
      <AccessRemovalButton
        userLabel="Only Owner"
        scopeLabel="this project"
        consequence="Access would be removed."
        disabledReason="Assign another Owner first."
        isPending={false}
        onConfirm={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Remove' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Assign another Owner first.');
  });
});
