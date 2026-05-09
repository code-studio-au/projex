import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import type { TxnSplitInput } from '../api/contract';
import type { CategoryId, SubCategoryId, Txn } from '../types';
import { asCategoryId, asSubCategoryId } from '../types';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import { formatCurrencyFromCents, fromCents, toCents } from '../utils/money';

type SplitDraftRow = {
  key: string;
  item: string;
  description: string;
  amountCents: number;
  categoryId: CategoryId | null;
  subCategoryId: SubCategoryId | null;
};

function createInitialRows(txn: Txn): SplitDraftRow[] {
  const firstAmount = Math.floor(txn.amountCents / 2);
  const secondAmount = txn.amountCents - firstAmount;
  return [
    {
      key: 'split-1',
      item: `${txn.item} split 1`,
      description: txn.description,
      amountCents: firstAmount,
      categoryId: txn.categoryId ?? null,
      subCategoryId: txn.subCategoryId ?? null,
    },
    {
      key: 'split-2',
      item: `${txn.item} split 2`,
      description: txn.description,
      amountCents: secondAmount,
      categoryId: null,
      subCategoryId: null,
    },
  ];
}

export default function TransactionSplitModal(props: {
  opened: boolean;
  txn: Txn | null;
  taxonomy: TaxonomyHook;
  currencyCode: string;
  onClose: () => void;
  onSplit: (children: TxnSplitInput['children']) => Promise<void>;
}) {
  const { opened, txn, taxonomy, currencyCode, onClose, onSplit } = props;
  const [rows, setRows] = useState<SplitDraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!opened || !txn) return;
    setRows(createInitialRows(txn));
    setError(null);
    setSubmitting(false);
  }, [opened, txn]);

  const totalCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.amountCents, 0),
    [rows]
  );
  const remainingCents = txn ? txn.amountCents - totalCents : 0;
  const hasInvalidAmount = rows.some((row) => {
    if (!txn) return true;
    if (row.amountCents === 0) return true;
    if (txn.amountCents > 0) return row.amountCents < 0;
    if (txn.amountCents < 0) return row.amountCents > 0;
    return true;
  });
  const canSubmit =
    Boolean(txn) &&
    rows.length >= 2 &&
    !hasInvalidAmount &&
    remainingCents === 0 &&
    !submitting;

  function updateRow(key: string, patch: Partial<SplitDraftRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: `split-${Date.now()}-${current.length}`,
        item: txn ? `${txn.item} split ${current.length + 1}` : '',
        description: txn?.description ?? '',
        amountCents: 0,
        categoryId: null,
        subCategoryId: null,
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function submit() {
    if (!txn || !canSubmit) return;

    try {
      setSubmitting(true);
      setError(null);
      await onSplit(
        rows.map((row) => ({
          item: row.item.trim() || undefined,
          description: row.description.trim() || undefined,
          amountCents: row.amountCents,
          categoryId: row.categoryId,
          subCategoryId: row.subCategoryId,
        }))
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not split transaction'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Split transaction"
      size="xl"
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

          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}

          <Stack gap="sm">
            {rows.map((row, index) => {
              const subCategoryOptions = row.categoryId
                ? taxonomy.subCategoryOptionsForCategory(row.categoryId)
                : [];
              return (
                <Paper key={row.key} withBorder radius="md" p="sm">
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Text fw={600} size="sm">
                        Split line {index + 1}
                      </Text>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Remove split line"
                        disabled={rows.length <= 2 || submitting}
                        onClick={() => removeRow(row.key)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>

                    <Group align="flex-start" gap="sm" grow>
                      <TextInput
                        label="Item"
                        value={row.item}
                        disabled={submitting}
                        onChange={(event) =>
                          updateRow(row.key, {
                            item: event.currentTarget.value,
                          })
                        }
                      />
                      <TextInput
                        label="Description"
                        value={row.description}
                        disabled={submitting}
                        onChange={(event) =>
                          updateRow(row.key, {
                            description: event.currentTarget.value,
                          })
                        }
                      />
                      <NumberInput
                        label="Amount"
                        value={fromCents(row.amountCents)}
                        min={txn.amountCents < 0 ? undefined : 0}
                        max={txn.amountCents < 0 ? 0 : undefined}
                        thousandSeparator=","
                        prefix="$"
                        decimalScale={2}
                        fixedDecimalScale
                        hideControls
                        disabled={submitting}
                        onChange={(value) =>
                          updateRow(row.key, {
                            amountCents: toCents(Number(value ?? 0)),
                          })
                        }
                      />
                    </Group>

                    <Group align="flex-start" gap="sm" grow>
                      <Select
                        label="Category"
                        data={taxonomy.categoryOptions}
                        value={row.categoryId}
                        placeholder="Optional"
                        clearable
                        searchable
                        disabled={submitting}
                        onChange={(value) =>
                          updateRow(row.key, {
                            categoryId: value ? asCategoryId(value) : null,
                            subCategoryId: null,
                          })
                        }
                      />
                      <Select
                        label="Subcategory"
                        data={subCategoryOptions}
                        value={row.subCategoryId}
                        placeholder={
                          row.categoryId ? 'Optional' : 'Pick category first'
                        }
                        clearable
                        searchable
                        disabled={!row.categoryId || submitting}
                        onChange={(value) =>
                          updateRow(row.key, {
                            subCategoryId: value
                              ? asSubCategoryId(value)
                              : null,
                          })
                        }
                      />
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          <Group justify="space-between" align="center" wrap="wrap">
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              disabled={submitting}
              onClick={addRow}
            >
              Add split line
            </Button>
            <Stack gap={2} align="flex-end">
              <Text size="sm">
                Allocated:{' '}
                <strong>
                  {formatCurrencyFromCents(totalCents, currencyCode)}
                </strong>
              </Text>
              <Text
                size="sm"
                c={remainingCents === 0 && !hasInvalidAmount ? 'teal' : 'red'}
              >
                Remainder:{' '}
                <strong>
                  {formatCurrencyFromCents(remainingCents, currencyCode)}
                </strong>
              </Text>
            </Stack>
          </Group>

          <Group justify="flex-end">
            <Button variant="subtle" disabled={submitting} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} loading={submitting} onClick={submit}>
              Split transaction
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
