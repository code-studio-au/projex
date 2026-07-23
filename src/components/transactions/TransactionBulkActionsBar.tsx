import { Button, Group, Menu, Paper, Text, Tooltip } from '@mantine/core';

import classes from '../../styles/ui.module.css';
import { MAX_BULK_TXN_COUNT } from '../../utils/transactionLimits';

export default function TransactionBulkActionsBar(props: {
  selectedTxnCount: number;
  selectedCountLabel: string;
  selectableTxnCount: number;
  selectingAll: boolean;
  selectedAutoMappedPendingCount: number;
  selectedSuggestedReversalCount: number;
  selectedUnlockedCategorisableCount: number;
  selectedDeletableCount: number;
  canManageReversals: boolean;
  canAdminUnlock: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkReviewed: () => void;
  onMarkUnreviewed: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onApproveAutoMappings: () => void;
  onApproveSuggestedReversals: () => void;
  onOpenRecode: () => void;
  onClearCoding: () => void;
  onDeleteSelected: () => void;
}) {
  const {
    selectedTxnCount,
    selectedCountLabel,
    selectableTxnCount,
    selectingAll,
    selectedAutoMappedPendingCount,
    selectedSuggestedReversalCount,
    selectedUnlockedCategorisableCount,
    selectedDeletableCount,
    canManageReversals,
    canAdminUnlock,
    onSelectAll,
    onClearSelection,
    onMarkReviewed,
    onMarkUnreviewed,
    onLock,
    onUnlock,
    onApproveAutoMappings,
    onApproveSuggestedReversals,
    onOpenRecode,
    onClearCoding,
    onDeleteSelected,
  } = props;
  const selectAllExceedsLimit = selectableTxnCount > MAX_BULK_TXN_COUNT;

  return (
    <Paper className={classes.bulkActionsBar} radius="md" p="sm" withBorder>
      <Group justify="space-between" gap="sm" align="center" wrap="wrap">
        <Group gap="xs" align="center" wrap="wrap">
          <Text size="sm" fw={600}>
            {selectedCountLabel} selected
          </Text>
          {selectedTxnCount < selectableTxnCount ? (
            <Tooltip
              disabled={!selectAllExceedsLimit}
              label={`Narrow the workflow or date filters to ${MAX_BULK_TXN_COUNT.toLocaleString()} rows or fewer.`}
            >
              <span>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  loading={selectingAll}
                  disabled={selectAllExceedsLimit}
                  onClick={onSelectAll}
                >
                  Select all ({selectableTxnCount.toLocaleString()} rows)
                </Button>
              </span>
            </Tooltip>
          ) : null}
          <Button size="compact-sm" variant="subtle" onClick={onClearSelection}>
            Clear
          </Button>
        </Group>
        <Group gap="xs" wrap="wrap">
          {canManageReversals && selectedSuggestedReversalCount > 0 ? (
            <Button
              size="compact-sm"
              variant="light"
              color="blue"
              onClick={onApproveSuggestedReversals}
            >
              Approve matches ({selectedSuggestedReversalCount})
            </Button>
          ) : null}
          {selectedAutoMappedPendingCount > 0 ? (
            <Button
              size="compact-sm"
              variant="light"
              color="teal"
              onClick={onApproveAutoMappings}
            >
              Approve coding ({selectedAutoMappedPendingCount})
            </Button>
          ) : null}
          {selectedUnlockedCategorisableCount > 0 ? (
            <Button size="compact-sm" variant="light" onClick={onOpenRecode}>
              Recode ({selectedUnlockedCategorisableCount})
            </Button>
          ) : null}
          <Button size="compact-sm" variant="light" onClick={onMarkReviewed}>
            Mark reviewed
          </Button>
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <Button size="compact-sm" variant="default">
                More actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={onMarkUnreviewed}>Mark unreviewed</Menu.Item>
              <Menu.Item onClick={onLock}>Lock transactions</Menu.Item>
              {canAdminUnlock ? (
                <Menu.Item onClick={onUnlock}>Unlock transactions</Menu.Item>
              ) : null}
              <Menu.Divider />
              <Menu.Item
                disabled={selectedUnlockedCategorisableCount === 0}
                onClick={onClearCoding}
              >
                Clear coding
              </Menu.Item>
              <Menu.Item
                color="red"
                disabled={selectedDeletableCount === 0}
                onClick={onDeleteSelected}
              >
                Delete eligible ({selectedDeletableCount})
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Paper>
  );
}
