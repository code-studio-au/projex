import { Button, Group, Paper, Stack, Text } from '@mantine/core';

export default function TransactionBulkActionsBar(props: {
  selectedCountLabel: string;
  selectedAutoMappedPendingCount: number;
  selectedUnlockedCategorisableCount: number;
  onClearSelection: () => void;
  onMarkReviewed: () => void;
  onMarkUnreviewed: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onApproveAutoMappings: () => void;
  onOpenRecode: () => void;
  onClearCoding: () => void;
}) {
  const {
    selectedCountLabel,
    selectedAutoMappedPendingCount,
    selectedUnlockedCategorisableCount,
    onClearSelection,
    onMarkReviewed,
    onMarkUnreviewed,
    onLock,
    onUnlock,
    onApproveAutoMappings,
    onOpenRecode,
    onClearCoding,
  } = props;

  return (
    <Paper radius="xl" p="md">
      <Stack gap="sm">
        <Group gap="sm" align="center" wrap="wrap">
          <Text size="sm" fw={600}>
            {selectedCountLabel} selected on this page
          </Text>
          <Button size="compact-sm" variant="subtle" onClick={onClearSelection}>
            Clear selection
          </Button>
        </Group>
        <Group gap="sm" wrap="wrap">
          <Button size="xs" variant="light" onClick={onMarkReviewed}>
            Mark reviewed
          </Button>
          <Button
            size="xs"
            variant="light"
            color="gray"
            onClick={onMarkUnreviewed}
          >
            Mark unreviewed
          </Button>
          <Button size="xs" variant="light" color="dark" onClick={onLock}>
            Lock
          </Button>
          <Button size="xs" variant="light" color="gray" onClick={onUnlock}>
            Unlock
          </Button>
          <Button
            size="xs"
            variant="light"
            color="teal"
            disabled={selectedAutoMappedPendingCount === 0}
            onClick={onApproveAutoMappings}
          >
            Approve auto-mappings ({selectedAutoMappedPendingCount})
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={selectedUnlockedCategorisableCount === 0}
            onClick={onOpenRecode}
          >
            Recode selected
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            disabled={selectedUnlockedCategorisableCount === 0}
            onClick={onClearCoding}
          >
            Clear coding
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
