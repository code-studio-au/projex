import { useState } from 'react';
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
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import { formatCurrencyFromCents } from '../utils/money';
import classes from '../styles/ui.module.css';

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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Move transaction"
      size="lg"
      centered
    >
      {!txn ? null : (
        <TransactionTransferModalContent
          key={`${txn.id}:${opened ? 'open' : 'closed'}`}
          txn={txn}
          currencyCode={currencyCode}
          projectOptions={projectOptions}
          onClose={onClose}
          onTransfer={onTransfer}
        />
      )}
    </Modal>
  );
}

function TransactionTransferModalContent(props: {
  txn: Txn;
  currencyCode: string;
  projectOptions: Array<{ value: ProjectId; label: string }>;
  onClose: () => void;
  onTransfer: (input: {
    destinationProjectId: ProjectId;
    item?: string;
    description?: string;
  }) => Promise<void>;
}) {
  const { txn, currencyCode, projectOptions, onClose, onTransfer } = props;
  const [destinationProjectId, setDestinationProjectId] =
    useState<ProjectId | null>(null);
  const [item, setItem] = useState(txn.item);
  const [description, setDescription] = useState(txn.description);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!destinationProjectId) return;

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
    <Stack className={classes.modalStack}>
      <Paper withBorder radius="md" p="md" className={classes.modalCard}>
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

      <Alert color="blue" className={classes.notice}>
        The current project will keep a transfer-out marker for audit, but this
        amount will no longer affect its budget actuals. The receiving project
        gets a new uncoded transaction to review.
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
        {...firefoxSafeModalSelectProps}
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

      <Group className={classes.footerRow}>
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
  );
}
