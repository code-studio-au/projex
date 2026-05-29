import { useMemo } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';

import type { CompanyId, ImportPreviewRow, ProjectId, Txn } from '../types';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { BudgetsHook } from '../hooks/useBudgets';
import { formatCurrencyFromCents } from '../utils/money';
import {
  type ImportPreviewTab,
  usePowerBiImportWorkflow,
} from '../hooks/usePowerBiImportWorkflow';

function displayWarningsForRow(row: ImportPreviewRow): string[] {
  return row.warnings.filter(
    (warning) =>
      !(
        row.mappingStatus === 'uncoded' &&
        warning.startsWith('No category/subcategory could be resolved.')
      )
  );
}

export default function PowerBiImporterPanel(props: {
  taxonomy: TaxonomyHook;
  budgets: BudgetsHook;
  companyId: CompanyId;
  projectId: ProjectId;
  currencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
  onAppend: (
    txns: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => Promise<void>;
  onReplaceAll: (
    txns: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => Promise<void>;
}) {
  const {
    taxonomy,
    budgets,
    companyId,
    projectId,
    currencyCode,
    canEditTaxonomy,
    canEditBudgets,
    onAppend,
    onReplaceAll,
  } = props;

  const isMobile = useMediaQuery('(max-width: 48em)');
  const importer = usePowerBiImportWorkflow({
    taxonomy,
    budgets,
    companyId,
    projectId,
    canEditBudgets,
    initialPageSize: isMobile ? 10 : 20,
    onAppend,
    onReplaceAll,
  });

  const exampleCsv = `Ledger,Fiscal Year,Period,CC and Description,RC and Description,PC and Description,AC,Expenditure Actuals,Journal Line Description,Journal ID,Reference Num,Journal Date,Journal Line,Journal Line Ref,Posted Date,Unpost Seq,Source,Operator ID,PO ID,Vendor ID,Vendor Name
ACTUALS,2026,4,4041 Upskilling,Research Centre,Programme Code,EXP,1234.56,External training course,JRNL-100,REF-9,46137,12,A,46138,0,EXP,OP-1,PO-44,VEN-10,Learning Vendor
ACTUALS,2026,4,4041 Upskilling,Research Centre,Programme Code,EXP,500.00,Payroll recharge,JRNL-101,REF-10,46137,13,A,46138,0,SAL,OP-1,,,
`;

  const {
    file,
    isReadingFile,
    draftCsvText,
    autoCreateStructures,
    skipDuplicates,
    previewTab,
    confirmReplaceOpen,
    importNotice,
    importError,
    previewSourceLabel,
    excludedImportIds,
    pagination,
    sorting,
    previewActive,
    activePreviewRows,
    includedPreviewRows,
    needsReviewPreviewRows,
    duplicatePreviewRows,
    invalidPreviewRows,
    excludedPreviewRows,
    visiblePreviewRows,
    previewSummary,
    hasBlockingIssues,
    hasReplaceAllBlockers,
    setAutoCreateStructures,
    setSkipDuplicates,
    setPreviewTab,
    setConfirmReplaceOpen,
    setPagination,
    setSorting,
    handleFileChange,
    handleDraftCsvTextChange,
    clearPreview,
    previewImport,
    togglePreviewRow,
    commitAppend,
    commitReplaceAll,
  } = importer;

  const previewColumns = useMemo<MRT_ColumnDef<ImportPreviewRow>[]>(
    () => [
      {
        accessorKey: 'sourceRowIndex',
        header: 'Row',
        size: 72,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'importedId',
        header: 'Imported ID',
        size: 140,
        accessorFn: (row) => row.externalId ?? '',
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.externalId ?? '—'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'parsedDate',
        header: 'Date',
        size: 92,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.parsedDate ?? 'Missing'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'item',
        header: 'Item',
        size: 150,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.item ?? 'Missing item'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.description ?? 'Missing description'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'amountCents',
        header: 'Amount',
        size: 112,
        Cell: ({ row }) => (
          <Text className="table-body-emphasis">
            {row.original.amountCents == null
              ? 'Missing'
              : formatCurrencyFromCents(row.original.amountCents, currencyCode)}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right txnTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right txnTable-cell',
        },
      },
      {
        id: 'mapping',
        header: 'Mapping',
        size: 220,
        accessorFn: (row) =>
          `${row.categoryName ?? ''} ${row.subCategoryName ?? ''} ${row.mappingStatus} ${row.duplicateReason ?? ''}`,
        enableSorting: false,
        Cell: ({ row }) => (
          <Stack gap={4}>
            <Group gap="xs" wrap="wrap">
              {excludedImportIds.has(row.original.importId) ? (
                <Badge size="sm" variant="light" color="gray">
                  Excluded
                </Badge>
              ) : null}
              {row.original.importAction === 'review' ? (
                <Badge size="sm" variant="light" color="yellow">
                  Needs review
                </Badge>
              ) : null}
              {row.original.importAction === 'exclude' ? (
                <Badge size="sm" variant="light" color="gray">
                  Rule excluded
                </Badge>
              ) : null}
              <Badge
                size="sm"
                variant="light"
                color={
                  row.original.mappingStatus === 'invalid'
                    ? 'red'
                    : row.original.mappingStatus === 'uncoded'
                      ? 'red'
                      : row.original.mappingStatus === 'matched_rule'
                        ? 'green'
                        : row.original.mappingStatus === 'auto_created'
                          ? 'yellow'
                          : 'green'
                }
              >
                {row.original.mappingStatus === 'matched_rule'
                  ? 'Auto-Categorise match'
                  : row.original.mappingStatus === 'source_taxonomy'
                    ? 'Category match'
                    : row.original.mappingStatus === 'auto_created'
                      ? 'Will auto-create'
                      : row.original.mappingStatus === 'invalid'
                        ? 'Invalid'
                        : 'Uncoded'}
              </Badge>
              {row.original.duplicate ? (
                <Badge size="sm" variant="light" color="orange">
                  {row.original.duplicateReason === 'existing'
                    ? 'Existing duplicate'
                    : 'Import duplicate'}
                </Badge>
              ) : null}
            </Group>
            {row.original.categoryName && row.original.subCategoryName ? (
              <Text size="xs" c="dimmed">
                {row.original.categoryName} &gt; {row.original.subCategoryName}
              </Text>
            ) : null}
            {row.original.importRuleName ? (
              <Text size="xs" c="dimmed">
                Import rule: {row.original.importRuleName}
              </Text>
            ) : null}
          </Stack>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'warnings',
        header: 'Warnings',
        size: 320,
        accessorFn: (row) => displayWarningsForRow(row).join(' '),
        enableSorting: false,
        Cell: ({ row }) => {
          const warnings = displayWarningsForRow(row.original);
          return warnings.length ? (
            <Stack gap={2}>
              {warnings.map((warning, index) => (
                <Text
                  key={`${row.original.importId}-warning-${index}`}
                  size="xs"
                  c="dimmed"
                >
                  {warning}
                </Text>
              ))}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No warnings
            </Text>
          );
        },
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'action',
        header: 'Action',
        size: 100,
        enableSorting: false,
        Cell: ({ row }) => (
          <Button
            size="xs"
            variant={
              excludedImportIds.has(row.original.importId) ? 'light' : 'subtle'
            }
            color={
              excludedImportIds.has(row.original.importId) ? 'blue' : 'gray'
            }
            onClick={() => togglePreviewRow(row.original.importId)}
          >
            {excludedImportIds.has(row.original.importId)
              ? 'Include'
              : 'Exclude'}
          </Button>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
    ],
    [currencyCode, excludedImportIds, togglePreviewRow]
  );

  const excludedPreviewColumns = useMemo(
    () => previewColumns.filter((column) => column.id !== 'mapping'),
    [previewColumns]
  );

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg" className="importPanelCard">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={5}>PowerBI expenditure import</Title>
            {previewActive ? (
              <Button
                variant="subtle"
                color="gray"
                onClick={() => void clearPreview()}
              >
                Clear preview
              </Button>
            ) : null}
          </Group>

          {importError ? (
            <Alert color="red" variant="light">
              {importError}
            </Alert>
          ) : null}
          {importNotice ? (
            <Alert color="green" variant="light">
              {importNotice}
            </Alert>
          ) : null}

          <Text size="sm" c="dimmed" className="panelHelperText">
            Upload or paste the PowerBI expenditure actuals CSV export, then
            preview the import before committing it. Import Rules run first to
            exclude SAL/EXA and flag suspected salary transfers for review.
          </Text>

          <FileInput
            label="Upload PowerBI CSV"
            placeholder="Select file"
            value={file}
            disabled={previewActive}
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />

          <Textarea
            label="Paste PowerBI CSV"
            minRows={8}
            value={draftCsvText}
            disabled={previewActive}
            onChange={(event) =>
              handleDraftCsvTextChange(event.currentTarget.value)
            }
            placeholder={exampleCsv}
          />

          <Group gap="md" align="center" wrap="wrap">
            <Switch
              label="Auto-create new categories/subcategories and budget lines"
              checked={autoCreateStructures}
              disabled={previewActive || !canEditTaxonomy || !canEditBudgets}
              onChange={(event) =>
                setAutoCreateStructures(event.currentTarget.checked)
              }
              style={{ width: isMobile ? '100%' : 'auto' }}
            />
            <Switch
              label="Skip duplicates (existing and within this import)"
              checked={skipDuplicates}
              disabled={previewActive}
              onChange={(event) =>
                setSkipDuplicates(event.currentTarget.checked)
              }
              style={{ width: isMobile ? '100%' : 'auto' }}
            />
          </Group>

          <Group justify="flex-end" wrap="wrap">
            <Button
              fullWidth={isMobile}
              onClick={() => void previewImport()}
              loading={isReadingFile}
              disabled={
                previewActive ||
                isReadingFile ||
                (!file && !draftCsvText.trim())
              }
            >
              Preview import
            </Button>
          </Group>
        </Stack>
      </Paper>

      {previewActive ? (
        <Stack gap="md">
          <Paper withBorder radius="lg" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="sm" align="center" wrap="wrap">
                  <Title order={5}>PowerBI import preview</Title>
                </Group>
              </Group>

              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">
                  Included rows are what will be committed. Excluded rows are
                  kept separate so rule exclusions do not crowd the working
                  table.
                </Text>
              </Group>

              {previewSourceLabel ? (
                <Text size="sm" c="dimmed">
                  Preview source: {previewSourceLabel}
                </Text>
              ) : null}

              {hasBlockingIssues ? (
                <Alert color="red" variant="light">
                  Invalid rows, review rows, or duplicate handling settings will
                  block append until those rows are excluded, reviewed, or
                  corrected.
                </Alert>
              ) : null}

              {!hasBlockingIssues &&
              skipDuplicates &&
              previewSummary.duplicate > 0 ? (
                <Alert color="blue" variant="light">
                  Duplicate rows will be skipped automatically during append
                  unless you explicitly include them by turning off duplicate
                  skipping first.
                </Alert>
              ) : null}

              {!hasBlockingIssues && hasReplaceAllBlockers ? (
                <Alert color="red" variant="light">
                  Duplicate rows inside the import file will block replace all
                  until they are excluded.
                </Alert>
              ) : null}

              {!previewSummary.included ? (
                <Alert color="yellow" variant="light">
                  All preview rows are currently excluded from import.
                </Alert>
              ) : null}
            </Stack>
          </Paper>

          <Tabs
            value={previewTab}
            onChange={(value) => {
              if (
                value === 'included' ||
                value === 'needsReview' ||
                value === 'duplicate' ||
                value === 'invalid' ||
                value === 'excluded'
              ) {
                setPreviewTab(value as ImportPreviewTab);
              }
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="included">
                Included ({includedPreviewRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="needsReview">
                Needs review ({needsReviewPreviewRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="duplicate">
                Duplicate ({duplicatePreviewRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="invalid">
                Invalid ({invalidPreviewRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="excluded">
                Excluded ({excludedPreviewRows.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="included" pt="md">
              <MantineReactTable
                columns={previewColumns}
                data={visiblePreviewRows}
                getRowId={(row) => row.importId}
                state={{ pagination, sorting }}
                onPaginationChange={setPagination}
                onSortingChange={setSorting}
                enableColumnResizing
                enableSorting
                enableSortingRemoval={false}
                enableGlobalFilter
                enablePagination
                autoResetPageIndex={false}
                initialState={{ density: 'xs' }}
                mantineTableContainerProps={{
                  className: 'financeTable txnTable',
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                  style: { tableLayout: 'auto' },
                }}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                mantineTableBodyRowProps={({ row }) =>
                  row.original.mappingStatus === 'invalid'
                    ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                    : {}
                }
              />
            </Tabs.Panel>

            <Tabs.Panel value="needsReview" pt="md">
              <MantineReactTable
                columns={previewColumns}
                data={visiblePreviewRows}
                getRowId={(row) => row.importId}
                state={{ pagination, sorting }}
                onPaginationChange={setPagination}
                onSortingChange={setSorting}
                enableColumnResizing
                enableSorting
                enableSortingRemoval={false}
                enableGlobalFilter
                enablePagination
                autoResetPageIndex={false}
                initialState={{ density: 'xs' }}
                mantineTableContainerProps={{
                  className: 'financeTable txnTable',
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                  style: { tableLayout: 'auto' },
                }}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
              />
            </Tabs.Panel>

            <Tabs.Panel value="duplicate" pt="md">
              <MantineReactTable
                columns={previewColumns}
                data={visiblePreviewRows}
                getRowId={(row) => row.importId}
                state={{ pagination, sorting }}
                onPaginationChange={setPagination}
                onSortingChange={setSorting}
                enableColumnResizing
                enableSorting
                enableSortingRemoval={false}
                enableGlobalFilter
                enablePagination
                autoResetPageIndex={false}
                initialState={{ density: 'xs' }}
                mantineTableContainerProps={{
                  className: 'financeTable txnTable',
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                  style: { tableLayout: 'auto' },
                }}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
              />
            </Tabs.Panel>

            <Tabs.Panel value="invalid" pt="md">
              <MantineReactTable
                columns={previewColumns}
                data={visiblePreviewRows}
                getRowId={(row) => row.importId}
                state={{ pagination, sorting }}
                onPaginationChange={setPagination}
                onSortingChange={setSorting}
                enableColumnResizing
                enableSorting
                enableSortingRemoval={false}
                enableGlobalFilter
                enablePagination
                autoResetPageIndex={false}
                initialState={{ density: 'xs' }}
                mantineTableContainerProps={{
                  className: 'financeTable txnTable',
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                  style: { tableLayout: 'auto' },
                }}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                mantineTableBodyRowProps={() => ({
                  style: { outline: '1px solid rgba(255,0,0,0.20)' },
                })}
              />
            </Tabs.Panel>

            <Tabs.Panel value="excluded" pt="md">
              <MantineReactTable
                columns={excludedPreviewColumns}
                data={visiblePreviewRows}
                getRowId={(row) => row.importId}
                state={{ pagination, sorting }}
                onPaginationChange={setPagination}
                onSortingChange={setSorting}
                enableColumnResizing
                enableSorting
                enableSortingRemoval={false}
                enableGlobalFilter
                enablePagination
                autoResetPageIndex={false}
                initialState={{ density: 'xs' }}
                mantineTableContainerProps={{
                  className: 'financeTable txnTable',
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                  style: { tableLayout: 'auto' },
                }}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                mantineTableBodyRowProps={({ row }) =>
                  row.original.mappingStatus === 'invalid'
                    ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                    : {}
                }
              />
            </Tabs.Panel>
          </Tabs>

          <Paper withBorder radius="lg" p="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text size="sm" c="dimmed">
                Review the preview, exclude anything that should stay out of the
                tracker, then commit the included rows.{' '}
                {activePreviewRows.length} active row(s) remain outside the
                excluded tab.
              </Text>
              <Group wrap="wrap">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => void clearPreview()}
                >
                  Clear preview
                </Button>
                <Button
                  fullWidth={isMobile}
                  disabled={!previewSummary.included || hasBlockingIssues}
                  onClick={() => void commitAppend()}
                >
                  Append
                </Button>
                <Button
                  color="red"
                  fullWidth={isMobile}
                  disabled={!previewSummary.included || hasReplaceAllBlockers}
                  onClick={() => setConfirmReplaceOpen(true)}
                >
                  Replace all
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      ) : null}

      {!previewActive ? (
        <Paper
          withBorder
          radius="lg"
          p="lg"
          className="importPanelCard importExampleCard"
        >
          <Stack gap="sm">
            <Text fw={700}>Example PowerBI CSV</Text>
            <pre className="importExamplePre">{exampleCsv}</pre>
          </Stack>
        </Paper>
      ) : null}

      <Modal
        opened={confirmReplaceOpen}
        onClose={() => setConfirmReplaceOpen(false)}
        title="Replace all transactions?"
        fullScreen={isMobile}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className="panelHelperText">
            This will replace all existing transactions in this project with the
            currently included preview rows. This cannot be undone.
          </Text>
          <Group justify="flex-end" wrap="wrap">
            <Button
              variant="light"
              fullWidth={isMobile}
              onClick={() => setConfirmReplaceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              onClick={() => void commitReplaceAll()}
            >
              Replace all
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
