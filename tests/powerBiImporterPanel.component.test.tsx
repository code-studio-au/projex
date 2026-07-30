// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import PowerBiImporterPanel from '../src/components/PowerBiImporterPanel';
import type { ImportPreviewRow } from '../src/types';
import { asCompanyId, asImportBatchId, asProjectId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

const dependencyMocks = vi.hoisted(() => ({
  cancelPreview: vi.fn(),
  createImportRule: vi.fn(),
  previewImport: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../src/server/start/functions/importReads', () => ({
  cancelImportPreviewServerFn: dependencyMocks.cancelPreview,
  previewImportTransactionsServerFn: dependencyMocks.previewImport,
}));

vi.mock('../src/queries/importRules', () => ({
  useProjectImportRulesQuery: () => ({ data: [], isPending: false }),
  useCreateProjectImportRuleMutation: () => ({
    isPending: false,
    mutateAsync: dependencyMocks.createImportRule,
  }),
}));

vi.mock('../src/utils/toast', () => ({
  showAppToast: dependencyMocks.showToast,
}));

vi.mock('../src/components/importReview/ImportPreviewTabs', () => ({
  default: () => <div>Focused preview rows</div>,
}));

beforeAll(installComponentTestDom);
afterEach(() => {
  cleanup();
  dependencyMocks.cancelPreview.mockReset();
  dependencyMocks.createImportRule.mockReset();
  dependencyMocks.previewImport.mockReset();
  dependencyMocks.showToast.mockReset();
});

const previewRow: ImportPreviewRow = {
  sourceRowIndex: 1,
  importId: 'component-preview-row',
  parsedDate: '2026-07-30',
  amountCents: 15_000,
  item: 'Component import',
  description: 'Failure recovery',
  duplicate: false,
  importAction: 'import',
  mappingStatus: 'matched_rule',
  codingPendingApproval: false,
  willCreateCategory: false,
  willCreateSubCategory: false,
  willCreateBudgetLine: false,
  warnings: [],
};

describe('PowerBiImporterPanel failure recovery', () => {
  it('retains source and preview state across preview and commit retries', async () => {
    dependencyMocks.previewImport
      .mockRejectedValueOnce(new Error('Preview service unavailable'))
      .mockResolvedValueOnce({
        importBatchId: asImportBatchId('component-import-batch'),
        rows: [previewRow],
      });
    const onAppend = vi
      .fn()
      .mockRejectedValueOnce(new Error('Commit service unavailable'))
      .mockResolvedValueOnce({ count: 1, skipped: 0, replaced: 0 });
    const onImportComplete = vi.fn();
    renderComponent(
      <PowerBiImporterPanel
        companyId={asCompanyId('company-import-component')}
        projectId={asProjectId('project-import-component')}
        currencyCode="AUD"
        canEditTaxonomy
        canEditBudgets
        canManageImportRules
        onAppend={onAppend}
        onReplaceAll={vi.fn()}
        onImportComplete={onImportComplete}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Paste CSV or view example',
      })
    );
    const source = screen.getByLabelText('Paste PowerBI CSV');
    fireEvent.change(source, { target: { value: 'header,row' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Preview service unavailable'
    );
    expect((source as HTMLTextAreaElement).value).toBe('header,row');

    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    expect(
      await screen.findByRole('heading', { name: 'PowerBI import preview' })
    ).toBeTruthy();
    expect(screen.getByText('Focused preview rows')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Append' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Commit service unavailable'
    );
    expect(
      screen.getByRole('heading', { name: 'PowerBI import preview' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Append' }));
    await waitFor(() =>
      expect(onImportComplete).toHaveBeenCalledWith('Imported 1 rows.')
    );
    expect(onAppend).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('heading', { name: 'PowerBI expenditure import' })
    ).toBeTruthy();
  });
});
