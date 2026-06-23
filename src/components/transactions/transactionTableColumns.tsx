import {
  ActionIcon,
  Badge,
  Group,
  Menu,
  NumberInput,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import type { MRT_ColumnDef } from 'mantine-react-table-open';
import {
  IconDotsVertical,
  IconLock,
  IconMessageCircle,
  IconSettings,
} from '@tabler/icons-react';

import type { ProjectRuleSuggestionPrompt } from '../../api/contract';
import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import type { TransactionsHook } from '../../hooks/useTransactions';
import type { Txn, TxnComment, TxnCommentSummary } from '../../types';
import { asCategoryId, asSubCategoryId } from '../../types/ids';
import { formatCurrencyFromCents, fromCents, toCents } from '../../utils/money';
import {
  isBudgetImpactTxn,
  isCategorisableTxn,
  txnTypeLabel,
} from '../../utils/transactions';
import TransactionCommentsCell from './TransactionCommentsCell';

type CreateTransactionColumnsArgs = {
  txns: TransactionsHook;
  taxonomy: TaxonomyHook;
  currencyCode: string;
  readOnly: boolean;
  commentSummaryByTxnId: Map<string, TxnCommentSummary>;
  expandedCommentsTxn: Txn | null;
  expandedComments: TxnComment[];
  expandedCommentsLoading: boolean;
  transferOutEnabled: boolean;
  transferProjectOptions: Array<{ value: string; label: string }>;
  onApplyProjectRulePrompt: (prompt: ProjectRuleSuggestionPrompt | null) => void;
  onProjectRuleError: (message: string | null) => void;
  onOpenComments: (txn: Txn) => void;
  onToggleExpandedComments: (txn: Txn) => void;
  onOpenSplit: (txn: Txn) => void;
  onOpenTransfer: (txn: Txn) => void;
};

function canSplitTransaction(args: { readOnly: boolean; txn: Txn }) {
  return (
    !args.readOnly &&
    !args.txn.lockedAt &&
    isBudgetImpactTxn(args.txn) &&
    isCategorisableTxn(args.txn) &&
    (args.txn.txnType === 'standard' || args.txn.txnType === 'transfer_child')
  );
}

function canTransferTransaction(args: {
  readOnly: boolean;
  transferOutEnabled: boolean;
  transferProjectOptions: Array<{ value: string; label: string }>;
  txn: Txn;
}) {
  return (
    !args.readOnly &&
    args.transferOutEnabled &&
    !args.txn.lockedAt &&
    args.transferProjectOptions.length > 0 &&
    isBudgetImpactTxn(args.txn) &&
    isCategorisableTxn(args.txn) &&
    (args.txn.txnType === 'standard' || args.txn.txnType === 'split_child')
  );
}

function canEditTxnAmount(args: { readOnly: boolean; txn: Txn }) {
  return (
    !args.readOnly &&
    args.txn.txnType !== 'split_parent' &&
    args.txn.txnType !== 'transfer_source' &&
    args.txn.txnType !== 'transfer_child'
  );
}

function moveToSubcategoryCell(args: {
  row: Parameters<NonNullable<MRT_ColumnDef<Txn>['Edit']>>[0]['row'];
  table: Parameters<NonNullable<MRT_ColumnDef<Txn>['Edit']>>[0]['table'];
}) {
  const nextCell = args.row
    .getAllCells()
    .find((cell) => cell.column.id === 'subCategory');
  args.table.setEditingCell(nextCell ?? null);
}

export function createTransactionColumns(
  args: CreateTransactionColumnsArgs
): MRT_ColumnDef<Txn>[] {
  return [
    {
      accessorKey: 'date',
      header: 'Date',
      size: 92,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ cell }) => (
        <Text className="table-body-left">{cell.getValue<string>()}</Text>
      ),
    },
    {
      id: 'transaction',
      header: 'Transaction',
      accessorFn: (row) => `${row.item} ${row.description}`.trim(),
      size: 330,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ row }) => {
        const provenanceLabel =
          row.original.txnType === 'standard'
            ? null
            : txnTypeLabel(row.original);
        const description = row.original.description.trim();
        const hasValidSubCategory =
          !!row.original.subCategoryId &&
          args.taxonomy.validSubIds.has(row.original.subCategoryId);
        const showStateBadges =
          !!provenanceLabel ||
          !!row.original.lockedAt ||
          !!row.original.reviewedAt ||
          (!!row.original.codingPendingApproval && hasValidSubCategory);
        return (
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text className="table-body-left-bold" lineClamp={1}>
              {row.original.item}
            </Text>
            <Text c="dimmed" className="table-body-left" lineClamp={2}>
              {description || 'No description provided'}
            </Text>
            {showStateBadges ? (
              <Group gap={6} wrap="wrap">
                {row.original.lockedAt ? (
                  <Badge
                    size="xs"
                    color="gray"
                    variant="light"
                    leftSection={<IconLock size={11} />}
                  >
                    Locked
                  </Badge>
                ) : row.original.reviewedAt ? (
                  <Badge size="xs" color="green" variant="light">
                    Reviewed
                  </Badge>
                ) : null}
                {provenanceLabel ? (
                  <Badge size="xs" color="blue" variant="light">
                    {provenanceLabel}
                  </Badge>
                ) : null}
                {row.original.codingPendingApproval && hasValidSubCategory ? (
                  <Badge size="xs" color="yellow" variant="light">
                    Auto-mapped
                  </Badge>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        );
      },
    },
    {
      id: 'comments',
      header: 'Comments',
      size: 292,
      enableEditing: false,
      enableSorting: false,
      Cell: ({ row }) => {
        const summary = args.commentSummaryByTxnId.get(row.original.id);
        const isExpanded = args.expandedCommentsTxn?.id === row.original.id;

        return (
          <TransactionCommentsCell
            summary={summary}
            expanded={isExpanded}
            comments={
              isExpanded && args.expandedCommentsTxn?.id === row.original.id
                ? args.expandedComments
                : []
            }
            commentsLoading={
              isExpanded && args.expandedCommentsTxn?.id === row.original.id
                ? args.expandedCommentsLoading
                : false
            }
            onOpenComments={() => args.onOpenComments(row.original)}
            onToggleExpanded={() => args.onToggleExpandedComments(row.original)}
          />
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      accessorKey: 'amountCents',
      header: 'Amount',
      size: 118,
      enableEditing: (row) =>
        canEditTxnAmount({ readOnly: args.readOnly, txn: row.original }),
      Edit: ({ row, table }) => (
        <NumberInput
          value={fromCents(row.original.amountCents)}
          size="xs"
          thousandSeparator=","
          prefix="$"
          decimalScale={2}
          fixedDecimalScale
          hideControls
          styles={{ input: { textAlign: 'right' } }}
          onChange={(value) => {
            void args.txns
              .updateTxn(row.original.id, {
                amountCents: toCents(Number(value ?? 0)),
              })
              .then(() => table.setEditingCell(null));
          }}
        />
      ),
      Cell: ({ cell, row }) => {
        const excluded = !isBudgetImpactTxn(row.original);
        return (
          <Stack gap={2} align="flex-end">
            <Text className="table-body-emphasis">
              {formatCurrencyFromCents(cell.getValue<number>(), args.currencyCode)}
            </Text>
            {excluded ? (
              <Text size="xs" c="dimmed">
                Excluded
              </Text>
            ) : null}
          </Stack>
        );
      },
      mantineTableBodyCellProps: {
        className: 'table-body-right txnTable-cell',
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-right txnTable-head',
      },
    },
    {
      id: 'category',
      header: 'Category',
      size: 156,
      enableEditing: !args.readOnly,
      enableSorting: false,
      Edit: ({ row, table }) => {
        const canCode =
          !args.readOnly &&
          !row.original.lockedAt &&
          isCategorisableTxn(row.original);
        const current = row.original.categoryId ?? null;
        const shouldAutoAdvance =
          !row.original.subCategoryId ||
          !args.taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Select
            data={args.taxonomy.categoryOptions}
            value={current}
            placeholder="Select category"
            searchable
            clearable
            disabled={!canCode}
            onChange={(value) => {
              void args.txns
                .updateTxn(row.original.id, {
                  categoryId: value ? asCategoryId(value) : null,
                  subCategoryId: null,
                  companyDefaultMappingRuleId: null,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then(() => {
                  if (!value || !shouldAutoAdvance) {
                    table.setEditingCell(null);
                    return;
                  }
                  moveToSubcategoryCell({ row, table });
                });
            }}
          />
        );
      },
      Cell: ({ row }) => {
        if (!isCategorisableTxn(row.original)) {
          return (
            <Badge color="gray" variant="light">
              Source only
            </Badge>
          );
        }
        const categoryName = args.taxonomy.getCategoryName(row.original.categoryId);
        const isCategoryCoded = !!row.original.categoryId;
        return (
          <Group gap="xs" wrap="wrap">
            <Text
              className="table-body-left"
              c={row.original.categoryId ? undefined : 'dimmed'}
            >
              {categoryName}
            </Text>
            {!isCategoryCoded ? (
              <Badge color="red" variant="light">
                Uncoded
              </Badge>
            ) : null}
          </Group>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      id: 'subCategory',
      header: 'Subcategory',
      size: 188,
      enableEditing: !args.readOnly,
      enableSorting: false,
      Edit: ({ row, table }) => {
        const canCode =
          !args.readOnly &&
          !row.original.lockedAt &&
          isCategorisableTxn(row.original);
        const categoryId = row.original.categoryId;
        const options = categoryId
          ? args.taxonomy.subCategoryOptionsForCategory(categoryId)
          : [];
        const current = row.original.subCategoryId ?? null;
        return (
          <Select
            data={options}
            value={current}
            placeholder={
              categoryId ? 'Select subcategory' : 'Pick category first'
            }
            searchable
            clearable
            disabled={!categoryId || !canCode}
            onChange={(value) => {
              args.onProjectRuleError(null);
              void args.txns
                .updateTxn(row.original.id, {
                  categoryId: categoryId ?? null,
                  subCategoryId: value ? asSubCategoryId(value) : null,
                  companyDefaultMappingRuleId: null,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then((result) => {
                  table.setEditingCell(null);
                  args.onApplyProjectRulePrompt(result.projectRulePrompt);
                })
                .catch((error) => {
                  args.onProjectRuleError(
                    error instanceof Error
                      ? error.message
                      : 'Could not update transaction coding.'
                  );
                });
            }}
          />
        );
      },
      Cell: ({ row }) => {
        if (!isCategorisableTxn(row.original)) {
          return (
            <Badge color="gray" variant="light">
              Source only
            </Badge>
          );
        }
        const subCategoryName = args.taxonomy.getSubCategoryName(
          row.original.subCategoryId
        );
        const isFullyCoded =
          !!row.original.subCategoryId &&
          args.taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Group gap="xs" wrap="wrap">
            <Text className="table-body-left">{subCategoryName}</Text>
            {!isFullyCoded ? (
              <Badge color="red" variant="light">
                Uncoded
              </Badge>
            ) : null}
          </Group>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      id: 'actions',
      header: '',
      Header: () => <IconSettings size={16} aria-label="Actions" />,
      size: 58,
      enableEditing: false,
      enableSorting: false,
      Cell: ({ row }) => {
        const canSplit = canSplitTransaction({
          readOnly: args.readOnly,
          txn: row.original,
        });
        const canTransfer = canTransferTransaction({
          readOnly: args.readOnly,
          transferOutEnabled: args.transferOutEnabled,
          transferProjectOptions: args.transferProjectOptions,
          txn: row.original,
        });
        const hasValidSubCategory =
          !!row.original.subCategoryId &&
          args.taxonomy.validSubIds.has(row.original.subCategoryId);
        const canApproveAutoMapping =
          !args.readOnly &&
          !row.original.lockedAt &&
          row.original.codingPendingApproval &&
          hasValidSubCategory;
        return (
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Actions for ${row.original.item}`}
              >
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconMessageCircle size={14} />}
                onClick={() => args.onOpenComments(row.original)}
              >
                Comments
              </Menu.Item>
              {!args.readOnly ? (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    onClick={() =>
                      void args.txns.updateWorkflowState(row.original.id, {
                        reviewed: !row.original.reviewedAt,
                      })
                    }
                  >
                    {row.original.reviewedAt
                      ? 'Mark unreviewed'
                      : 'Mark reviewed'}
                  </Menu.Item>
                  {canApproveAutoMapping ? (
                    <Menu.Item
                      onClick={() => {
                        void args.txns.updateTxn(row.original.id, {
                          codingPendingApproval: false,
                        });
                      }}
                    >
                      Approve auto-mapping
                    </Menu.Item>
                  ) : null}
                  <Menu.Item
                    onClick={() =>
                      void args.txns.updateWorkflowState(row.original.id, {
                        locked: !row.original.lockedAt,
                      })
                    }
                  >
                    {row.original.lockedAt
                      ? 'Unlock transaction'
                      : 'Lock transaction'}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              ) : null}
              <Menu.Item
                disabled={!canSplit}
                onClick={() => args.onOpenSplit(row.original)}
              >
                Split transaction
              </Menu.Item>
              <Menu.Item
                disabled={!canTransfer}
                onClick={() => args.onOpenTransfer(row.original)}
              >
                Move to project
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
  ];
}
