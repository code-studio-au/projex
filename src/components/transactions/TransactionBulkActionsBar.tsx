import { Button, Group, Menu, Paper, Text } from '@mantine/core';

export default function TransactionBulkActionsBar(props: {
  selectedCountLabel: string;
  selectedAutoMappedPendingCount: number;
  selectedSuggestedReversalCount: number;
  selectedUnlockedCategorisableCount: number;
  selectedDeletableCount: number;
  canManageReversals: boolean;
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
    selectedCountLabel,
    selectedAutoMappedPendingCount,
    selectedSuggestedReversalCount,
    selectedUnlockedCategorisableCount,
    selectedDeletableCount,
    canManageReversals,
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

  return (
    <Paper radius="md" p="sm" withBorder bg="gray.0">
      <Group justify="space-between" gap="sm" align="center" wrap="wrap">
        <Group gap="xs" align="center" wrap="wrap">
          <Text size="sm" fw={600}>
            {selectedCountLabel} selected
          </Text>
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
              <Menu.Item onClick={onUnlock}>Unlock transactions</Menu.Item>
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
