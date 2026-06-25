import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import type { ProjectRuleSuggestionPrompt } from '../../api/contract';

export default function TransactionProjectRuleModal(props: {
  opened: boolean;
  prompt: ProjectRuleSuggestionPrompt | null;
  matchText: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onMatchTextChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const {
    opened,
    prompt,
    matchText,
    error,
    isSubmitting,
    onClose,
    onMatchTextChange,
    onSubmit,
  } = props;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create project auto-coding rule?"
      centered
    >
      <Stack gap="md">
        {error ? <Alert color="red">{error}</Alert> : null}
        <Text size="sm" c="dimmed">
          This pattern has now been manually coded{' '}
          {prompt?.supportingCount ?? 0} times. Create a project rule now to
          auto-code future imports and mark matching uncoded transactions for
          approval.
        </Text>
        <TextInput
          label="Match text"
          value={matchText}
          onChange={(event) => onMatchTextChange(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Not now
          </Button>
          <Button
            disabled={isSubmitting || !prompt || !matchText.trim()}
            onClick={() => {
              void onSubmit();
            }}
          >
            Create rule
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
