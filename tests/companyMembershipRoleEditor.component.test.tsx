// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import CompanyMembershipRoleEditor from '../src/components/companySettings/CompanyMembershipRoleEditor';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function defaultProps() {
  return {
    userLabel: 'Member User',
    currentRole: 'member' as const,
    isSelf: false,
    isOnlyAdmin: false,
    canEdit: true,
    isPending: false,
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };
}

async function selectRole(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  await waitFor(() => {
    const optionElement = [
      ...document.querySelectorAll<HTMLElement>('[data-combobox-option]'),
    ].find((element) => element.textContent === option);
    expect(optionElement).toBeTruthy();
    fireEvent.click(optionElement!);
  });
}

describe('CompanyMembershipRoleEditor', () => {
  it('reviews a table-row role change before routing it to the controller', async () => {
    const props = defaultProps();
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Member User' })
    );
    await screen.findByRole('dialog');
    await selectRole('Company role', 'Executive');

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Confirm company role change');
    expect(dialog.textContent).toContain('from Member to Executive');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm role change' })
    );

    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith('executive')
    );
  });

  it('keeps permission detail inside the review modal', async () => {
    const props = defaultProps();
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(screen.queryByText(/Can enter the company/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Member User' })
    );
    await screen.findByRole('dialog');
    expect(screen.getByText(/Can enter the company/)).toBeTruthy();
  });

  it('does not offer a write while the selected role is unchanged', async () => {
    renderComponent(<CompanyMembershipRoleEditor {...defaultProps()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Member User' })
    );
    await screen.findByRole('dialog');
    expect(
      (
        screen.getByRole('button', {
          name: 'Confirm role change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('blocks the only company admin from being demoted', async () => {
    const props = {
      ...defaultProps(),
      userLabel: 'Admin User',
      currentRole: 'admin' as const,
      isOnlyAdmin: true,
    };
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Admin User' })
    );
    await screen.findByRole('dialog');
    await selectRole('Company role', 'Member');
    expect(screen.getByRole('alert').textContent).toContain(
      'must retain at least one Admin'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Confirm role change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm role change' })
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('locks the row action while a slow mutation is pending', () => {
    const props = { ...defaultProps(), isPending: true };
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(
      (
        screen.getByRole('button', {
          name: 'Change role for Member User',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
