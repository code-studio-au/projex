import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import type { ProjectId, Txn } from '../types';
import { asProjectId } from '../types';
import { formatCurrencyFromCents } from '../utils/money';

export default function TransactionTransferModal(props: {
  opened: boolean;
  txn: Txn | null;
  currencyCode: string;
  projectOptions: Array<{ value: ProjectId; label: string }>;
  onClose: () => void;
  onTransfer: (input: {
    destinationProjectId: ProjectId;
    item?: string;
    description?: string;
  }) => Promise<void>;
}) {
  const { opened, txn, currencyCode, projectOptions, onClose, onTransfer } =
    props;
  const [destinationProjectId, setDestinationProjectId] =
    useState<ProjectId | null>(null);
  const [item, setItem] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!opened || !txn) return;
    setDestinationProjectId(null);
    setItem(txn.item);
    setDescription(txn.description);
    setError(null);
    setSubmitting(false);
  }, [opened, txn]);

  async function submit() {
    if (!txn || !destinationProjectId) return;

    try {
      setSubmitting(true);
      setError(null);
      await onTransfer({
        destinationProjectId,
        item: item.trim() || undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not move transaction'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Move transaction"
      size="lg"
      centered
    >
      {!txn ? null : (
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap={4}>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Text fw={700}>{txn.item}</Text>
                <Badge variant="light">
                  {formatCurrencyFromCents(txn.amountCents, currencyCode)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {txn.date} · {txn.description}
              </Text>
            </Stack>
          </Paper>

          <Alert color="blue" variant="light">
            The current project will keep a transfer-out marker for audit, but
            this amount will no longer affect its budget actuals. The receiving
            project gets a new uncoded transaction to review.
          </Alert>

          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}

          <Select
            label="Destination project"
            placeholder="Choose project"
            data={projectOptions}
            value={destinationProjectId}
            searchable
            disabled={submitting}
            onChange={(value) =>
              setDestinationProjectId(value ? asProjectId(value) : null)
            }
          />

          <TextInput
            label="Receiving transaction item"
            value={item}
            disabled={submitting}
            onChange={(event) => setItem(event.currentTarget.value)}
          />

          <TextInput
            label="Receiving transaction description"
            value={description}
            disabled={submitting}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="subtle" disabled={submitting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!destinationProjectId || submitting}
              loading={submitting}
              onClick={submit}
            >
              Move transaction
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
