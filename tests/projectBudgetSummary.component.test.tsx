// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ProjectBudgetSummary from '../src/components/budget/ProjectBudgetSummary';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

const defaultProps = {
  currencyCode: 'AUD',
  projectBudgetTotalCents: 100_000,
  projectAllocatedCents: 80_000,
  projectActualCents: 25_000,
  uncodedSummary: { count: 1, amountCents: 5_000 },
  pendingReversalCount: 0,
  pendingReversalCents: 0,
  hasPeriodFilter: false,
  isLoading: false,
  canEditProjectBudgetTotal: true,
  onUpdateProjectBudgetTotal: vi.fn().mockResolvedValue(undefined),
};

describe('ProjectBudgetSummary', () => {
  it('owns and commits the project-budget editing workflow', async () => {
    const onUpdateProjectBudgetTotal = vi.fn().mockResolvedValue(undefined);
    renderComponent(
      <ProjectBudgetSummary
        {...defaultProps}
        onUpdateProjectBudgetTotal={onUpdateProjectBudgetTotal}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit project budget total' })
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '1250.00' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save project budget total' })
    );

    await waitFor(() =>
      expect(onUpdateProjectBudgetTotal).toHaveBeenCalledWith(125_000)
    );
    expect(
      screen.getByRole('button', { name: 'Edit project budget total' })
    ).toBeTruthy();
  });

  it('reports over-allocation while keeping editing controls permission-bound', () => {
    renderComponent(
      <ProjectBudgetSummary
        {...defaultProps}
        projectAllocatedCents={120_000}
        canEditProjectBudgetTotal={false}
      />
    );

    expect(
      screen.getByText(/Budget allocations exceed the project budget/)
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Edit project budget total' })
    ).toBeNull();
  });

  it('keeps the project-budget editor open with its draft after a failed save', async () => {
    const onUpdateProjectBudgetTotal = vi
      .fn()
      .mockRejectedValueOnce(new Error('Budget update failed'))
      .mockResolvedValueOnce(undefined);
    renderComponent(
      <ProjectBudgetSummary
        {...defaultProps}
        onUpdateProjectBudgetTotal={onUpdateProjectBudgetTotal}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit project budget total' })
    );
    const input = screen.getByRole('textbox', {
      name: 'Project budget total',
    });
    fireEvent.change(input, { target: { value: '1500.00' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save project budget total' })
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Budget update failed'
    );
    expect((input as HTMLInputElement).value).toBe('$1,500.00');
    expect(
      screen.queryByRole('button', { name: 'Edit project budget total' })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save project budget total' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Edit project budget total' })
      ).toBeTruthy()
    );
    expect(onUpdateProjectBudgetTotal).toHaveBeenCalledTimes(2);
  });
});
