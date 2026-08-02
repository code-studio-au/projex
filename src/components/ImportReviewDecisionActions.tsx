import { Button, Group, Text } from '@mantine/core';

export type ImportReviewDecision = 'import_uncoded' | 'exclude';
export type ImportReviewDecisionScope = 'all' | 'selected';

export default function ImportReviewDecisionActions(props: {
  remainingCount: number;
  selectedCount: number;
  onDecision: (
    decision: ImportReviewDecision,
    scope: ImportReviewDecisionScope
  ) => void;
}) {
  const { remainingCount, selectedCount, onDecision } = props;

  return (
    <Group justify="space-between" align="center" mb="sm" wrap="wrap">
      <Text size="sm" c="dimmed">
        Every row must be imported without coding or excluded before this import
        can continue. The matched rule and your decision remain with the import
        batch.
      </Text>
      <Group gap="xs" wrap="wrap">
        <Button
          size="xs"
          variant="light"
          disabled={!remainingCount}
          onClick={() => onDecision('import_uncoded', 'all')}
        >
          Import all as uncoded
        </Button>
        <Button
          size="xs"
          variant="light"
          color="gray"
          disabled={!remainingCount}
          onClick={() => onDecision('exclude', 'all')}
        >
          Exclude all
        </Button>
        <Button
          size="xs"
          disabled={!selectedCount}
          onClick={() => onDecision('import_uncoded', 'selected')}
        >
          Import selected as uncoded ({selectedCount})
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          disabled={!selectedCount}
          onClick={() => onDecision('exclude', 'selected')}
        >
          Exclude selected ({selectedCount})
        </Button>
      </Group>
    </Group>
  );
}
