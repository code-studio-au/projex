// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ImportReviewDecisionActions from '../src/components/ImportReviewDecisionActions';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

describe('ImportReviewDecisionActions', () => {
  it('maps each bulk decision to the correct action and scope', () => {
    const onDecision = vi.fn();
    renderComponent(
      <ImportReviewDecisionActions
        remainingCount={4}
        selectedCount={2}
        onDecision={onDecision}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Import all as uncoded' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exclude all' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Import selected as uncoded (2)',
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Exclude selected (2)' })
    );

    expect(onDecision.mock.calls).toEqual([
      ['import_uncoded', 'all'],
      ['exclude', 'all'],
      ['import_uncoded', 'selected'],
      ['exclude', 'selected'],
    ]);
  });

  it('disables decisions when their row scope is empty', () => {
    renderComponent(
      <ImportReviewDecisionActions
        remainingCount={0}
        selectedCount={0}
        onDecision={vi.fn()}
      />
    );

    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
