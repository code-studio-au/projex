import { useCallback, useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';

import type { TxnImportInput, TxnImportResult } from '../api/types';
import type {
  CompanyId,
  ImportPreviewRow,
  ImportRuleField,
  ImportRuleOperator,
  ProjectId,
} from '../types';
import { formatCurrencyFromCents } from '../utils/money';
import {
  matchesPowerBiImportRule,
  toPowerBiExpenditureActualsRow,
} from '../utils/powerBiImport';
import {
  type ImportPreviewTab,
  usePowerBiImportWorkflow,
} from '../hooks/usePowerBiImportWorkflow';
import {
  useCreateProjectImportRuleMutation,
  useProjectImportRulesQuery,
} from '../queries/importRules';
import { suggestImportExclusionRuleFromPreviewRow } from '../utils/importRuleSuggestions';
import { showAppToast } from '../utils/toast';
import ImportReviewDecisionActions from './ImportReviewDecisionActions';
import classes from '../styles/ui.module.css';

const fieldOptions: Array<{ value: ImportRuleField; label: string }> = [
  { value: 'ledger', label: 'Ledger' },
  { value: 'source', label: 'Source' },
  { value: 'journalId', label: 'Journal ID' },
  { value: 'journalLineDescription', label: 'Journal Line Description' },
  { value: 'ccAndDescription', label: 'CC and Description' },
  { value: 'vendorName', label: 'Vendor Name' },
  { value: 'poId', label: 'PO ID' },
  { value: 'referenceNum', label: 'Reference Num' },
  { value: 'anyText', label: 'Any source text' },
];

const operatorOptions: Array<{ value: ImportRuleOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'equals_any', label: 'Equals any of' },
  { value: 'contains', label: 'Contains' },
  { value: 'contains_any', label: 'Contains any of' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'starts_with_any', label: 'Starts with any of' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'ends_with_any', label: 'Ends with any of' },
];

const importRuleSelectProps = {
  withScrollArea: false,
  styles: {
    dropdown: {
      maxHeight: 180,
      overflowY: 'auto',
    },
  },
} as const;

type PowerBiImportCommitOptions = Pick<
  TxnImportInput,
  | 'importBatchId'
  | 'skipDuplicates'
  | 'excludedSourceRowIndexes'
  | 'reviewDecisions'
>;

function toImportRuleField(value: string | null): ImportRuleField | null {
  return fieldOptions.some((option) => option.value === value)
    ? (value as ImportRuleField)
    : null;
}

function toImportRuleOperator(value: string | null): ImportRuleOperator | null {
  return operatorOptions.some((option) => option.value === value)
    ? (value as ImportRuleOperator)
    : null;
}

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
  companyId: CompanyId;
  projectId: ProjectId;
  currencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
  canManageImportRules: boolean;
  onAppend: (options: PowerBiImportCommitOptions) => Promise<TxnImportResult>;
  onReplaceAll: (
    options: PowerBiImportCommitOptions
  ) => Promise<TxnImportResult>;
  onImportComplete: (message: string) => void;
}) {
  const {
    companyId,
    projectId,
    currencyCode,
    canEditTaxonomy,
    canEditBudgets,
    canManageImportRules,
    onAppend,
    onReplaceAll,
    onImportComplete,
  } = props;

  const isMobile = useMediaQuery('(max-width: 48em)');
  const importRulesQ = useProjectImportRulesQuery(projectId);
  const createImportRule = useCreateProjectImportRuleMutation(
    companyId,
    projectId
  );
  const importer = usePowerBiImportWorkflow({
    projectId,
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
    isPreviewing,
    draftCsvText,
    autoCreateStructures,
    skipDuplicates,
    previewTab,
    confirmReplaceOpen,
    importError,
    previewSourceLabel,
    excludedSourceRowIndexes,
    reviewDecisions,
    pagination,
    sorting,
    previewActive,
    includedPreviewRows,
    needsReviewPreviewRows,
    unresolvedReviewPreviewRows,
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
    setReviewRowsDecision,
    commitAppend,
    commitReplaceAll,
  } = importer;
  const [excludeRuleRow, setExcludeRuleRow] = useState<ImportPreviewRow | null>(
    null
  );
  const [excludeRuleName, setExcludeRuleName] = useState('');
  const [excludeRuleField, setExcludeRuleField] =
    useState<ImportRuleField>('source');
  const [excludeRuleOperator, setExcludeRuleOperator] =
    useState<ImportRuleOperator>('equals');
  const [excludeRuleValue, setExcludeRuleValue] = useState('');
  const [excludeRuleError, setExcludeRuleError] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const openExcludeRuleModal = useCallback((row: ImportPreviewRow) => {
    const suggestion = suggestImportExclusionRuleFromPreviewRow(row);
    if (!suggestion) {
      setExcludeRuleRow(row);
      setExcludeRuleName('Exclude imported row');
      setExcludeRuleField('journalLineDescription');
      setExcludeRuleOperator('contains');
      setExcludeRuleValue(row.description ?? row.item ?? '');
      return;
    }
    setExcludeRuleRow(row);
    setExcludeRuleName(suggestion.name);
    setExcludeRuleField(suggestion.field);
    setExcludeRuleOperator(suggestion.operator);
    setExcludeRuleValue(suggestion.value);
  }, []);

  function closeExcludeRuleModal() {
    setExcludeRuleRow(null);
    setExcludeRuleError(null);
  }

  const selectedPreviewRows = useMemo(
    () =>
      visiblePreviewRows.filter(
        (row) => rowSelection[String(row.sourceRowIndex)]
      ),
    [rowSelection, visiblePreviewRows]
  );

  const selectedNeedsReviewRows = useMemo(
    () => selectedPreviewRows.filter((row) => row.importAction === 'review'),
    [selectedPreviewRows]
  );

  const handleTogglePreviewRow = useCallback(
    (row: ImportPreviewRow) => {
      const currentlyExcluded = excludedSourceRowIndexes.has(
        row.sourceRowIndex
      );
      togglePreviewRow(row.sourceRowIndex);

      if (
        currentlyExcluded ||
        !canManageImportRules ||
        row.importAction === 'exclude'
      ) {
        return;
      }

      setExcludeRuleError(null);
      openExcludeRuleModal(row);
    },
    [
      canManageImportRules,
      excludedSourceRowIndexes,
      openExcludeRuleModal,
      togglePreviewRow,
    ]
  );

  const handleReviewDecision = useCallback(
    (
      rows: ImportPreviewRow[],
      decision: 'import_uncoded' | 'exclude',
      mode: 'selected' | 'all' | 'row'
    ) => {
      const eligibleRows =
        decision === 'import_uncoded'
          ? rows.filter(
              (row) => row.mappingStatus !== 'invalid' && !row.duplicate
            )
          : rows;
      const sourceRowIndexes = eligibleRows.map((row) => row.sourceRowIndex);

      if (!sourceRowIndexes.length) {
        showAppToast({
          tone: 'warning',
          title: 'No eligible review rows',
          message:
            mode === 'selected'
              ? 'Select one or more review rows first.'
              : 'Invalid and duplicate review rows must be excluded.',
        });
        return;
      }

      setReviewRowsDecision(sourceRowIndexes, decision);
      setRowSelection({});
      showAppToast({
        tone: 'success',
        title:
          decision === 'import_uncoded'
            ? 'Review decision recorded'
            : 'Review rows excluded',
        message:
          decision === 'import_uncoded'
            ? `${sourceRowIndexes.length} review row${sourceRowIndexes.length === 1 ? '' : 's'} will be imported without coding.`
            : `${sourceRowIndexes.length} review row${sourceRowIndexes.length === 1 ? '' : 's'} will be excluded from this import.`,
      });
    },
    [setReviewRowsDecision]
  );

  async function handleCreateExcludeRule() {
    if (!excludeRuleRow) return;

    const name = excludeRuleName.trim();
    const value = excludeRuleValue.trim();
    if (!name) {
      setExcludeRuleError('Rule name is required.');
      return;
    }
    if (!value) {
      setExcludeRuleError('Match value is required.');
      return;
    }

    try {
      setExcludeRuleError(null);
      const previousExcludedCount = excludedPreviewRows.filter(
        (row) => row.importAction === 'exclude'
      ).length;
      const maxSortOrder = (importRulesQ.data ?? []).reduce(
        (max, rule) => Math.max(max, rule.sortOrder),
        0
      );
      const createdRule = await createImportRule.mutateAsync({
        companyId,
        projectId,
        scope: 'project',
        name,
        action: 'exclude',
        field: excludeRuleField,
        operator: excludeRuleOperator,
        value,
        sortOrder: maxSortOrder + 10,
        enabled: true,
      });
      const refreshedPreview = await previewImport();
      const matchedPreviewRowCount =
        refreshedPreview?.rows.filter((row) => {
          if (!row.rawSourceRow) return false;
          return matchesPowerBiImportRule(
            toPowerBiExpenditureActualsRow(row.rawSourceRow),
            createdRule
          );
        }).length ?? 0;
      const nextExcludedCount =
        refreshedPreview?.rows.filter((row) => row.importAction === 'exclude')
          .length ?? 0;
      const newlyExcludedCount = Math.max(
        0,
        nextExcludedCount - previousExcludedCount
      );

      if (matchedPreviewRowCount === 0) {
        setExcludeRuleError(
          'The exclusion rule was saved, but it did not match any preview rows. Adjust the field, operator, or value and try again.'
        );
        showAppToast({
          tone: 'warning',
          title: 'Project import rule saved',
          message:
            'The rule was saved, but it excluded 0 preview rows. Adjust the field, operator, or value and try again.',
        });
        return;
      }

      closeExcludeRuleModal();
      showAppToast({
        tone: 'success',
        title: 'Project import rule created',
        message:
          matchedPreviewRowCount === newlyExcludedCount
            ? `Created project import rule and excluded ${matchedPreviewRowCount} preview row${matchedPreviewRowCount === 1 ? '' : 's'}.`
            : `Created project import rule. It matched ${matchedPreviewRowCount} preview row${matchedPreviewRowCount === 1 ? '' : 's'} and excluded ${newlyExcludedCount} new row${newlyExcludedCount === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      setExcludeRuleError(
        error instanceof Error
          ? error.message
          : 'Could not create the import exclusion rule.'
      );
    }
  }

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
        Cell: ({ row }) => {
          const reviewDecision = reviewDecisions.get(
            row.original.sourceRowIndex
          );
          const isReviewRow = row.original.importAction === 'review';
          return (
            <Stack gap={4}>
              <Group gap="xs" wrap="wrap">
                {isReviewRow && !reviewDecision ? (
                  <Badge size="sm" variant="light" color="yellow">
                    Decision required
                  </Badge>
                ) : null}
                {reviewDecision === 'import_uncoded' ? (
                  <Badge size="sm" variant="light" color="blue">
                    Import uncoded
                  </Badge>
                ) : null}
                {reviewDecision === 'exclude' ||
                (!isReviewRow &&
                  excludedSourceRowIndexes.has(row.original.sourceRowIndex)) ? (
                  <Badge size="sm" variant="light" color="gray">
                    Excluded
                  </Badge>
                ) : null}
                {row.original.importAction === 'exclude' ? (
                  <Badge size="sm" variant="light" color="gray">
                    Rule excluded
                  </Badge>
                ) : null}
                {!isReviewRow ? (
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
                ) : null}
                {row.original.duplicate ? (
                  <Badge size="sm" variant="light" color="orange">
                    {row.original.duplicateReason === 'existing'
                      ? 'Existing duplicate'
                      : 'Import duplicate'}
                  </Badge>
                ) : null}
              </Group>
              {!isReviewRow &&
              row.original.categoryName &&
              row.original.subCategoryName ? (
                <Text size="xs" c="dimmed">
                  {row.original.categoryName} &gt;{' '}
                  {row.original.subCategoryName}
                </Text>
              ) : null}
              {row.original.importRuleName ? (
                <Text size="xs" c="dimmed">
                  Import rule: {row.original.importRuleName}
                </Text>
              ) : null}
              {isReviewRow && reviewDecision === 'import_uncoded' ? (
                <Text size="xs" c="dimmed">
                  Any suggested category will be ignored so this transaction
                  enters the coding workflow.
                </Text>
              ) : null}
              {displayWarningsForRow(row.original).length ? (
                <Stack gap={2}>
                  {displayWarningsForRow(row.original).map((warning, index) => (
                    <Text
                      key={`${row.original.sourceRowIndex}-warning-${index}`}
                      size="xs"
                      c="dimmed"
                    >
                      {warning}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Stack>
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
        size: 220,
        enableSorting: false,
        Cell: ({ row }) => {
          if (row.original.importAction === 'review') {
            const decision = reviewDecisions.get(row.original.sourceRowIndex);
            const cannotImport =
              row.original.mappingStatus === 'invalid' ||
              row.original.duplicate;
            return (
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant={decision === 'import_uncoded' ? 'filled' : 'light'}
                  disabled={cannotImport}
                  onClick={() =>
                    handleReviewDecision(
                      [row.original],
                      'import_uncoded',
                      'row'
                    )
                  }
                >
                  Import uncoded
                </Button>
                <Button
                  size="xs"
                  variant={decision === 'exclude' ? 'filled' : 'subtle'}
                  color="gray"
                  onClick={() =>
                    handleReviewDecision([row.original], 'exclude', 'row')
                  }
                >
                  Exclude
                </Button>
              </Group>
            );
          }

          return (
            <Button
              size="xs"
              variant={
                excludedSourceRowIndexes.has(row.original.sourceRowIndex)
                  ? 'light'
                  : 'subtle'
              }
              color={
                excludedSourceRowIndexes.has(row.original.sourceRowIndex)
                  ? 'blue'
                  : 'gray'
              }
              onClick={() => handleTogglePreviewRow(row.original)}
            >
              {excludedSourceRowIndexes.has(row.original.sourceRowIndex)
                ? 'Include'
                : 'Exclude'}
            </Button>
          );
        },
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
    ],
    [
      currencyCode,
      excludedSourceRowIndexes,
      handleReviewDecision,
      handleTogglePreviewRow,
      reviewDecisions,
    ]
  );

  const excludedPreviewColumns = useMemo(
    () => previewColumns.filter((column) => column.id !== 'mapping'),
    [previewColumns]
  );

  async function handleCommitAppend() {
    const message = await commitAppend();
    if (message) onImportComplete(message);
  }

  async function handleCommitReplaceAll() {
    const message = await commitReplaceAll();
    if (message) onImportComplete(message);
  }

  return (
    <Stack gap="lg" className={classes.pageStack}>
      {!previewActive ? (
        <Paper
          className={`${classes.surfaceCard} importPanelCard`}
          radius="xl"
          p="lg"
        >
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text className={classes.sectionEyebrow}>Import</Text>
                <Title order={5} mt={4}>
                  PowerBI expenditure import
                </Title>
              </div>
            </Group>

            {importError ? (
              <Alert color="red" className={classes.notice}>
                {importError}
              </Alert>
            ) : null}
            <Text size="sm" c="dimmed" className={classes.filterIntro}>
              Upload or paste the PowerBI expenditure actuals CSV export, then
              preview the import before committing it. Import Rules run first to
              exclude known non-project rows or require a decision for uncertain
              rows. EXA rows import by default so reversal candidates can be
              matched.
            </Text>

            <FileInput
              label="Upload PowerBI CSV"
              placeholder="Select file"
              value={file}
              disabled={isPreviewing}
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />

            <Accordion variant="contained">
              <Accordion.Item value="paste-csv">
                <Accordion.Control>Paste CSV or view example</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Textarea
                      label="Paste PowerBI CSV"
                      description="Use this option instead of uploading a CSV file."
                      minRows={8}
                      value={draftCsvText}
                      disabled={isPreviewing}
                      onChange={(event) =>
                        handleDraftCsvTextChange(event.currentTarget.value)
                      }
                      placeholder="Paste the exported CSV content here"
                    />

                    <Stack gap="xs">
                      <Text fw={700} size="sm">
                        Example PowerBI CSV
                      </Text>
                      <pre className="importExamplePre">{exampleCsv}</pre>
                    </Stack>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <Group gap="md" align="center" wrap="wrap">
              <Switch
                label="Auto-create new categories/subcategories and budget lines"
                checked={autoCreateStructures}
                disabled={isPreviewing || !canEditTaxonomy || !canEditBudgets}
                onChange={(event) =>
                  setAutoCreateStructures(event.currentTarget.checked)
                }
                className={isMobile ? classes.fieldFull : undefined}
              />
              <Switch
                label="Skip duplicates (existing and within this import)"
                checked={skipDuplicates}
                disabled={isPreviewing}
                onChange={(event) =>
                  setSkipDuplicates(event.currentTarget.checked)
                }
                className={isMobile ? classes.fieldFull : undefined}
              />
            </Group>

            <Group className={classes.footerRow}>
              <Button
                fullWidth={isMobile}
                onClick={() => void previewImport()}
                loading={isReadingFile || isPreviewing}
                disabled={
                  isReadingFile ||
                  isPreviewing ||
                  (!file && !draftCsvText.trim())
                }
              >
                Preview import
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : null}

      {previewActive ? (
        <Stack gap="md">
          <Paper className={classes.surfaceCard} radius="xl" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="sm" align="center" wrap="wrap">
                  <Title order={5}>PowerBI import preview</Title>
                </Group>
                <Button variant="default" onClick={() => void clearPreview()}>
                  Cancel preview
                </Button>
              </Group>

              {importError ? (
                <Alert color="red" className={classes.notice}>
                  {importError}
                </Alert>
              ) : null}

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
                <Alert color="red" className={classes.notice}>
                  Complete every review decision and resolve invalid or
                  duplicate rows before committing this import.
                </Alert>
              ) : null}

              {!hasBlockingIssues &&
              skipDuplicates &&
              previewSummary.duplicate > 0 ? (
                <Alert color="blue" className={classes.notice}>
                  Duplicate rows will be skipped automatically during append
                  unless you explicitly include them by turning off duplicate
                  skipping first.
                </Alert>
              ) : null}

              {!hasBlockingIssues && hasReplaceAllBlockers ? (
                <Alert color="red" className={classes.notice}>
                  Duplicate rows inside the import file will block period
                  replacement until they are excluded.
                </Alert>
              ) : null}

              {!previewSummary.included ? (
                <Alert color="yellow" className={classes.notice}>
                  All preview rows are currently excluded from import.
                </Alert>
              ) : null}
            </Stack>
          </Paper>

          <Tabs
            value={previewTab}
            className={classes.softTabs}
            onChange={(value) => {
              if (
                value === 'included' ||
                value === 'needsReview' ||
                value === 'duplicate' ||
                value === 'invalid' ||
                value === 'excluded'
              ) {
                setRowSelection({});
                setPreviewTab(value as ImportPreviewTab);
              }
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="included">
                Included ({includedPreviewRows.length})
              </Tabs.Tab>
              <Tabs.Tab value="needsReview">
                Review ({unresolvedReviewPreviewRows.length} remaining)
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
              <div className={classes.tableWrap}>
                <MantineReactTable
                  columns={previewColumns}
                  data={visiblePreviewRows}
                  getRowId={(row) => String(row.sourceRowIndex)}
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
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="needsReview" pt="md">
              <ImportReviewDecisionActions
                remainingCount={needsReviewPreviewRows.length}
                selectedCount={selectedNeedsReviewRows.length}
                onDecision={(decision, scope) =>
                  handleReviewDecision(
                    scope === 'all'
                      ? needsReviewPreviewRows
                      : selectedNeedsReviewRows,
                    decision,
                    scope
                  )
                }
              />
              <div className={classes.tableWrap}>
                <MantineReactTable
                  columns={previewColumns}
                  data={visiblePreviewRows}
                  getRowId={(row) => String(row.sourceRowIndex)}
                  enableRowSelection
                  state={{ pagination, rowSelection, sorting }}
                  onPaginationChange={(updater) => {
                    setRowSelection({});
                    setPagination(updater);
                  }}
                  onRowSelectionChange={setRowSelection}
                  onSortingChange={(updater) => {
                    const nextSorting =
                      typeof updater === 'function'
                        ? updater(sorting)
                        : updater;
                    setRowSelection({});
                    setSorting(nextSorting);
                    setPagination((current) => ({
                      ...current,
                      pageIndex: 0,
                    }));
                  }}
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
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="duplicate" pt="md">
              <div className={classes.tableWrap}>
                <MantineReactTable
                  columns={previewColumns}
                  data={visiblePreviewRows}
                  getRowId={(row) => String(row.sourceRowIndex)}
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
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="invalid" pt="md">
              <div className={classes.tableWrap}>
                <MantineReactTable
                  columns={previewColumns}
                  data={visiblePreviewRows}
                  getRowId={(row) => String(row.sourceRowIndex)}
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
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="excluded" pt="md">
              <div className={classes.tableWrap}>
                <MantineReactTable
                  columns={excludedPreviewColumns}
                  data={visiblePreviewRows}
                  getRowId={(row) => String(row.sourceRowIndex)}
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
              </div>
            </Tabs.Panel>
          </Tabs>

          <Paper className={classes.surfaceCard} radius="xl" p="md">
            <Group className={classes.footerRowBetween}>
              <Text size="sm" c="dimmed">
                Review the preview and resolve all flagged rows, then commit{' '}
                {includedPreviewRows.length} included row(s).{' '}
                {unresolvedReviewPreviewRows.length} review decision(s) remain.
              </Text>
              <Group wrap="wrap">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => void clearPreview()}
                >
                  Cancel preview
                </Button>
                <Button
                  fullWidth={isMobile}
                  disabled={hasBlockingIssues}
                  onClick={() => void handleCommitAppend()}
                >
                  {previewSummary.included ? 'Append' : 'Complete import'}
                </Button>
                <Button
                  color="red"
                  fullWidth={isMobile}
                  disabled={!previewSummary.included || hasReplaceAllBlockers}
                  onClick={() => setConfirmReplaceOpen(true)}
                >
                  Replace imported period
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      ) : null}

      <Modal
        opened={confirmReplaceOpen}
        onClose={() => setConfirmReplaceOpen(false)}
        title="Replace imported period?"
        fullScreen={isMobile}
        centered={!isMobile}
        styles={{
          body: {
            maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            This replaces PowerBI-imported transactions within the preview's
            date range. Transactions outside that period are preserved, and
            replacement is blocked if the period contains reviewed, locked,
            commented, reversal-linked, or structurally related transactions.
          </Text>
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              onClick={() => setConfirmReplaceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              onClick={() => void handleCommitReplaceAll()}
            >
              Replace imported period
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={excludeRuleRow !== null}
        onClose={closeExcludeRuleModal}
        title="Create import exclusion rule"
        fullScreen={isMobile}
        centered={!isMobile}
        styles={{
          body: {
            maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md">
          {excludeRuleError ? (
            <Alert color="red">{excludeRuleError}</Alert>
          ) : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            This row is already excluded from the current preview. Save a
            project import rule if you want matching rows to auto-exclude on
            future imports for this project and after preview refreshes.
          </Text>
          <TextInput
            label="Rule name"
            value={excludeRuleName}
            onChange={(event) => {
              setExcludeRuleError(null);
              setExcludeRuleName(event.currentTarget.value);
            }}
          />
          <Group grow align="flex-end">
            <Select
              label="Field"
              data={fieldOptions}
              value={excludeRuleField}
              {...importRuleSelectProps}
              onChange={(value) => {
                const next = toImportRuleField(value);
                if (!next) return;
                setExcludeRuleError(null);
                setExcludeRuleField(next);
              }}
            />
            <Select
              label="Match"
              data={operatorOptions}
              value={excludeRuleOperator}
              {...importRuleSelectProps}
              onChange={(value) => {
                const next = toImportRuleOperator(value);
                if (!next) return;
                setExcludeRuleError(null);
                setExcludeRuleOperator(next);
              }}
            />
          </Group>
          <TextInput
            label="Value"
            value={excludeRuleValue}
            onChange={(event) => {
              setExcludeRuleError(null);
              setExcludeRuleValue(event.currentTarget.value);
            }}
          />
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              onClick={closeExcludeRuleModal}
            >
              Not now
            </Button>
            <Button
              fullWidth={isMobile}
              onClick={() => void handleCreateExcludeRule()}
              loading={createImportRule.isPending}
            >
              Create project rule
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
