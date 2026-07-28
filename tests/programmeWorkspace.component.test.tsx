// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ProgrammeWorkspace from '../src/components/ProgrammeWorkspace';
import type { CompanySummaryProject } from '../src/types';
import { asProjectId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function createProgrammeSummary(): CompanySummaryProject {
  return {
    id: asProjectId('programme-component-test'),
    name: 'Delivery programme',
    projectType: 'programme',
    status: 'active',
    visibility: 'company',
    currency: 'AUD',
    budgetCents: 50_000,
    months: [
      {
        monthKey: '2026-01',
        actualCodedCents: 10_000,
        adjustedActualCodedCents: 10_000,
        uncodedCount: 1,
        uncodedAmountCents: 2_000,
        pendingReversalCount: 0,
        pendingReversalCents: 0,
      },
    ],
    children: [
      {
        id: asProjectId('child-component-test'),
        name: 'Active child',
        projectType: 'project',
        parentProjectId: asProjectId('programme-component-test'),
        status: 'active',
        visibility: 'company',
        currency: 'AUD',
        budgetCents: 25_000,
        months: [
          {
            monthKey: '2026-01',
            actualCodedCents: 5_000,
            adjustedActualCodedCents: 5_000,
            uncodedCount: 0,
            uncodedAmountCents: 0,
            pendingReversalCount: 0,
            pendingReversalCents: 0,
          },
        ],
      },
    ],
  };
}

const defaultProps = {
  companyName: 'Example Company',
  projectName: 'Delivery programme',
  currencyCode: 'AUD' as const,
  programmeSummary: createProgrammeSummary(),
  canViewProgrammeSummary: true,
  headerReady: true,
  isMobile: false,
  yearFilterOptions: [{ value: '2026', label: '2026' }],
  yearFilter: null,
  quarterFilterOptions: [{ value: 'Q1', label: 'Q1' }],
  quarterFilter: null,
  monthFilterOptions: [{ value: '2026-01', label: '2026-01' }],
  monthFilterKey: null,
  onYearFilterChange: vi.fn(),
  onQuarterFilterChange: vi.fn(),
  onMonthFilterChange: vi.fn(),
  onOpenProject: vi.fn(),
};

describe('ProgrammeWorkspace', () => {
  it('keeps restricted rollup data out of the rendered view', () => {
    renderComponent(
      <ProgrammeWorkspace {...defaultProps} canViewProgrammeSummary={false} />
    );

    expect(screen.getByText(/Programme rollups are available/)).toBeTruthy();
    expect(screen.queryByText('Active child')).toBeNull();
    expect(screen.queryByText('Programme rollup')).toBeNull();
  });

  it('delegates filter resets and child navigation to the coordinator', () => {
    const onYearFilterChange = vi.fn();
    const onQuarterFilterChange = vi.fn();
    const onMonthFilterChange = vi.fn();
    const onOpenProject = vi.fn();
    renderComponent(
      <ProgrammeWorkspace
        {...defaultProps}
        yearFilter="2026"
        quarterFilter="Q1"
        monthFilterKey="2026-01"
        onYearFilterChange={onYearFilterChange}
        onQuarterFilterChange={onQuarterFilterChange}
        onMonthFilterChange={onMonthFilterChange}
        onOpenProject={onOpenProject}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onYearFilterChange).toHaveBeenCalledWith(null);
    expect(onQuarterFilterChange).toHaveBeenCalledWith(null);
    expect(onMonthFilterChange).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Active child' }));
    expect(onOpenProject).toHaveBeenCalledWith(
      asProjectId('child-component-test')
    );
  });
});
