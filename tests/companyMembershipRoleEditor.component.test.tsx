// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import CompanyMembershipRoleEditor from '../src/components/companySettings/CompanyMembershipRoleEditor';
import { asUserId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function defaultProps() {
  return {
    userOptions: [
      { value: asUserId('usr_admin'), label: 'Admin User' },
      { value: asUserId('usr_member'), label: 'Member User' },
    ],
    selectedUserId: asUserId('usr_member'),
    currentRole: 'member' as const,
    selectedRole: 'member' as const,
    selectedUserIsSelf: false,
    wouldDemoteLastAdmin: false,
    isPending: false,
    onUserChange: vi.fn(),
    onRoleChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };
}

function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('CompanyMembershipRoleEditor', () => {
  it('reviews an explicit role change before routing it to the controller', async () => {
    const props = defaultProps();
    const view = renderComponent(<CompanyMembershipRoleEditor {...props} />);

    selectOption('User', 'Admin User');
    selectOption('Company role', 'Executive');
    expect(props.onUserChange).toHaveBeenCalledWith(asUserId('usr_admin'));
    expect(props.onRoleChange).toHaveBeenCalledWith('executive');

    view.rerender(
      <CompanyMembershipRoleEditor
        {...props}
        selectedUserId={asUserId('usr_admin')}
        currentRole="admin"
        selectedRole="executive"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Confirm company role change');
    expect(dialog.textContent).toContain('from Admin to Executive');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm role change' })
    );

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledOnce());
  });

  it('does not offer a write while the selected role is unchanged', () => {
    const props = defaultProps();
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(
      (
        screen.getByRole('button', {
          name: 'Review change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText(/No database write will occur/)).toBeTruthy();
  });

  it('blocks the only company admin from being demoted', () => {
    const props = {
      ...defaultProps(),
      selectedUserId: asUserId('usr_admin'),
      currentRole: 'admin' as const,
      selectedRole: 'member' as const,
      wouldDemoteLastAdmin: true,
    };
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'must retain at least one Admin'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Review change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('locks the membership decision while a slow mutation is pending', () => {
    const props = { ...defaultProps(), isPending: true };
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(
      (screen.getByRole('combobox', { name: 'User' }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Company role',
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Review change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
