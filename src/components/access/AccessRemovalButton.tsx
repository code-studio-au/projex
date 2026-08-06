import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';

export default function AccessRemovalButton(props: {
  userLabel: string;
  scopeLabel: string;
  consequence: string;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const {
    userLabel,
    scopeLabel,
    consequence,
    disabled = false,
    disabledReason,
    isPending,
    onConfirm,
  } = props;
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Stack gap={2} align="flex-start">
        <Button
          size="xs"
          color="red"
          variant="light"
          className="tableActionButton"
          disabled={disabled || !!disabledReason || isPending}
          title={disabledReason}
          onClick={() => setOpened(true)}
        >
          Remove
        </Button>
        {disabledReason ? (
          <Text size="xs" c="dimmed" maw={260}>
            {disabledReason}
          </Text>
        ) : null}
      </Stack>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={`Remove ${userLabel} from ${scopeLabel}?`}
        centered
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
        withCloseButton={!isPending}
      >
        <Stack gap="md">
          <Alert color="red" title="Access will change immediately">
            {consequence}
          </Alert>
          <Text size="sm">
            This does not delete the user account. An authorized administrator
            can grant access again later.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={isPending}
              onClick={() => setOpened(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={isPending}
              onClick={async () => {
                try {
                  await onConfirm();
                  setOpened(false);
                } catch {
                  // The parent owns the visible mutation error. Keep this
                  // confirmation open so the administrator can safely retry.
                }
              }}
            >
              Remove access
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
