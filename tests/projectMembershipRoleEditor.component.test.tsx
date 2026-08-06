// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ProjectMembershipRoleEditor, {
  ProjectMembershipAssignmentEditor,
} from '../src/components/projectSettings/ProjectMembershipRoleEditor';
import { asUserId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function roleProps() {
  return {
    userLabel: 'Member User',
    currentRole: 'member' as const,
    isSelf: false,
    isOnlyOwner: false,
    hasCompanyWideProjectAccess: false,
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

describe('ProjectMembershipRoleEditor', () => {
  it('reviews an existing user role change from the Users table', async () => {
    const props = roleProps();
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    expect(screen.queryByText(/lead project operations/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Member User' })
    );
    await screen.findByRole('dialog');
    await selectRole('Project role', 'Lead');
    expect(screen.getByText(/lead project operations/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm role change' })
    );

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('lead'));
  });

  it('blocks demoting the only project owner', async () => {
    const props = {
      ...roleProps(),
      userLabel: 'Owner User',
      currentRole: 'owner' as const,
      isOnlyOwner: true,
    };
    renderComponent(<ProjectMembershipRoleEditor {...props} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Owner User' })
    );
    await screen.findByRole('dialog');
    await selectRole('Project role', 'Member');
    expect(screen.getByRole('alert').textContent).toContain(
      'must retain at least one Owner'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Confirm role change',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('warns before a self-demotion removes settings access', async () => {
    renderComponent(
      <ProjectMembershipRoleEditor {...roleProps()} currentRole="lead" isSelf />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Change role for Member User' })
    );
    await screen.findByRole('dialog');
    await selectRole('Project role', 'Member');
    expect(screen.getByRole('alert').textContent).toMatch(
      /you will leave project settings/i
    );
  });
});

describe('ProjectMembershipAssignmentEditor', () => {
  it('keeps initial-role permission detail in the add-user review modal', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComponent(
      <ProjectMembershipAssignmentEditor
        userOptions={[{ value: asUserId('usr_member'), label: 'Member User' }]}
        selectedUserId={asUserId('usr_member')}
        selectedRole="member"
        canEdit
        isPending={false}
        onUserChange={vi.fn()}
        onRoleChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByText(/day-to-day financial work/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Project User' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Review project user access');
    expect(dialog.textContent).toContain('day-to-day financial work');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm and add user' })
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });
});
