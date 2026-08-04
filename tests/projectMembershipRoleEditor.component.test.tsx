// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ProjectMembershipRoleEditor from '../src/components/projectSettings/ProjectMembershipRoleEditor';
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
      { value: asUserId('usr_owner'), label: 'Owner User' },
      { value: asUserId('usr_member'), label: 'Member User' },
    ],
    selectedUserId: asUserId('usr_member'),
    currentRole: 'member' as const,
    selectedRole: 'lead' as const,
    selectedUserIsSelf: false,
    wouldRemoveLastOwner: false,
    wouldLoseSettingsAccess: false,
    canEdit: true,
    isPending: false,
    onUserChange: vi.fn(),
    onRoleChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ProjectMembershipRoleEditor', () => {
  it('makes an existing assignment an explicit reviewed role change', async () => {
    const props = defaultProps();
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    expect(screen.getByText(/lead project operations/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review role change' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('from Member to Lead');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm role change' })
    );

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledOnce());
  });

  it('blocks demoting the only project owner', () => {
    const props = {
      ...defaultProps(),
      selectedUserId: asUserId('usr_owner'),
      currentRole: 'owner' as const,
      selectedRole: 'member' as const,
      wouldRemoveLastOwner: true,
    };
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'must retain at least one Owner'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Review role change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('warns before a self-demotion removes settings access', async () => {
    const props = {
      ...defaultProps(),
      selectedUserIsSelf: true,
      wouldLoseSettingsAccess: true,
    };
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review role change' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/you will leave project settings/i);
  });

  it('distinguishes a new assignment from a role change', () => {
    const props = { ...defaultProps(), currentRole: null };
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    expect(
      screen.getByRole('button', { name: 'Review assignment' })
    ).toBeTruthy();
  });
});
