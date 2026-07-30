// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
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
    selectedRole: 'member' as const,
    wouldDemoteLastAdmin: false,
    isPending: false,
    onUserChange: vi.fn(),
    onRoleChange: vi.fn(),
    onSubmit: vi.fn(),
  };
}

function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('CompanyMembershipRoleEditor', () => {
  it('routes explicit user and role changes to the membership controller', () => {
    const props = defaultProps();
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    selectOption('User', 'Admin User');
    selectOption('Company role', 'executive');
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(props.onUserChange).toHaveBeenCalledWith(asUserId('usr_admin'));
    expect(props.onRoleChange).toHaveBeenCalledWith('executive');
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it('blocks the only company admin from being demoted', () => {
    const props = {
      ...defaultProps(),
      selectedUserId: asUserId('usr_admin'),
      wouldDemoteLastAdmin: true,
    };
    renderComponent(<CompanyMembershipRoleEditor {...props} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'must retain at least one admin'
    );
    expect(
      (screen.getByRole('button', { name: 'Set' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
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
      (screen.getByRole('button', { name: 'Set' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
