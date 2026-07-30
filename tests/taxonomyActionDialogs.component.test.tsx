// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import TaxonomyActionDialogs from '../src/components/taxonomyManager/TaxonomyActionDialogs';
import type { TaxonomyHook } from '../src/hooks/useTaxonomy';
import {
  asCategoryId,
  asCompanyId,
  asProjectAutoCodingRuleId,
  asProjectId,
  asSubCategoryId,
} from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

const queryMocks = vi.hoisted(() => ({
  autoCodingRules: [] as unknown[],
  bulkRecode: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock('../src/queries/projectAutoCodingRules', () => ({
  useProjectAutoCodingRulesQuery: () => ({
    data: queryMocks.autoCodingRules,
  }),
}));

vi.mock('../src/queries/taxonomy', () => ({
  useBulkRecodeProjectTransactionsMutation: () => queryMocks.bulkRecode,
}));

beforeAll(installComponentTestDom);
afterEach(() => {
  cleanup();
  queryMocks.autoCodingRules = [];
  queryMocks.bulkRecode.isPending = false;
  queryMocks.bulkRecode.mutateAsync.mockReset();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const companyId = asCompanyId('company-taxonomy-actions');
const projectId = asProjectId('project-taxonomy-actions');
const travelId = asCategoryId('category-travel');
const operationsId = asCategoryId('category-operations');
const flightsId = asSubCategoryId('subcategory-flights');
const softwareId = asSubCategoryId('subcategory-software');

function createTaxonomy(overrides: Partial<TaxonomyHook> = {}): TaxonomyHook {
  return {
    companyId,
    projectId,
    categories: [
      { id: travelId, companyId, projectId, name: 'Travel' },
      { id: operationsId, companyId, projectId, name: 'Operations' },
    ],
    subCategories: [
      {
        id: flightsId,
        companyId,
        projectId,
        categoryId: travelId,
        name: 'Flights',
      },
      {
        id: softwareId,
        companyId,
        projectId,
        categoryId: operationsId,
        name: 'Software',
      },
    ],
    categoryOptions: [
      { value: travelId, label: 'Travel' },
      { value: operationsId, label: 'Operations' },
    ],
    subCategoryOptions: [],
    subCategoryOptionsForCategory: vi.fn(),
    validSubIds: new Set([flightsId, softwareId]),
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    addSubCategory: vi.fn(),
    renameSubCategory: vi.fn(),
    moveSubCategory: vi.fn(),
    deleteSubCategory: vi.fn(),
    getCategoryName: vi.fn(),
    getSubCategoryName: vi.fn(),
    getSubCategory: vi.fn(),
    isLoading: false,
    ...overrides,
  };
}

function createProps(taxonomy: TaxonomyHook) {
  return {
    taxonomy,
    isMobile: false,
    error: null,
    pendingMove: null,
    pendingBulkRecode: null,
    pendingDelete: {
      kind: 'subcategory' as const,
      id: flightsId,
      name: 'Flights',
    },
    onCloseMove: vi.fn(),
    onCloseBulkRecode: vi.fn(),
    onCloseDelete: vi.fn(),
    onClearMessages: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
  };
}

function selectOption(label: string, option: RegExp | string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('TaxonomyActionDialogs destructive actions', () => {
  it('requires a safe replacement and locks a slow destructive mutation', async () => {
    queryMocks.autoCodingRules = [
      {
        id: asProjectAutoCodingRuleId('rule-flights'),
        companyId,
        projectId,
        matchText: 'airfare',
        categoryId: travelId,
        subCategoryId: flightsId,
        sortOrder: 10,
      },
    ];
    const deletion = deferred();
    const deleteSubCategory = vi.fn(() => deletion.promise);
    const taxonomy = createTaxonomy({ deleteSubCategory });
    const props = createProps(taxonomy);
    renderComponent(<TaxonomyActionDialogs {...props} />);

    expect(screen.getByRole('alert').textContent).toContain(
      '1 rule targets this subcategory'
    );
    expect(
      (screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    selectOption('Replacement category', 'Operations');
    selectOption('Replacement subcategory', 'Software');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteSubCategory).toHaveBeenCalledWith(flightsId, softwareId);
    expect(
      (screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    deletion.resolve();
    await waitFor(() => expect(props.onCloseDelete).toHaveBeenCalledOnce());
  });

  it('keeps the confirmation open and reports a failed deletion', async () => {
    queryMocks.autoCodingRules = [
      {
        id: asProjectAutoCodingRuleId('rule-flights'),
        companyId,
        projectId,
        matchText: 'airfare',
        categoryId: travelId,
        subCategoryId: flightsId,
        sortOrder: 10,
      },
    ];
    const deleteSubCategory = vi
      .fn()
      .mockRejectedValue(new Error('Taxonomy changed on the server'));
    const taxonomy = createTaxonomy({ deleteSubCategory });
    const props = createProps(taxonomy);
    renderComponent(<TaxonomyActionDialogs {...props} />);

    selectOption('Affected rule handling', /Delete 1 rule/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(props.onError).toHaveBeenCalledWith(
        'Taxonomy changed on the server'
      )
    );
    expect(props.onCloseDelete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Delete subcategory?' })
    ).toBeTruthy();
  });
});
