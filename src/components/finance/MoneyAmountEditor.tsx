import { useId, useState } from 'react';
import { ActionIcon, Group, NumberInput, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

import { fromCents } from '../../utils/money';
import { parseMoneyAmountDraft, type MoneyDraft } from './moneyAmountDraft';

export default function MoneyAmountEditor(props: {
  amountCents: number;
  inputLabel: string;
  saveLabel: string;
  cancelLabel: string;
  onSave: (amountCents: number) => Promise<void>;
  onSaved?: () => void;
  onCancel?: () => void;
  minimumCents?: number;
  alwaysShowActions?: boolean;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const {
    amountCents,
    inputLabel,
    saveLabel,
    cancelLabel,
    onSave,
    onSaved,
    onCancel,
    minimumCents,
    alwaysShowActions = false,
    disabled = false,
    inputClassName,
  } = props;
  const [draft, setDraft] = useState<MoneyDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const errorId = useId();
  const displayedDraft = draft ?? fromCents(amountCents);
  const parsedDraft = parseMoneyAmountDraft(displayedDraft, minimumCents);
  const isDirty = !parsedDraft.valid || parsedDraft.amountCents !== amountCents;
  const showActions = alwaysShowActions || isDirty || error !== null;

  function cancelEdit() {
    if (isSaving) return;
    setDraft(null);
    setError(null);
    onCancel?.();
  }

  async function commitEdit() {
    if (disabled || isSaving) return;
    const parsed = parseMoneyAmountDraft(displayedDraft, minimumCents);
    if (!parsed.valid) {
      setError(parsed.message);
      return;
    }
    if (parsed.amountCents === amountCents) {
      setError(null);
      onSaved?.();
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave(parsed.amountCents);
      setDraft(null);
      onSaved?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message.trim()
          ? saveError.message
          : 'Unable to save the amount. Try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Stack gap={2}>
      <Group gap={4} wrap="nowrap">
        <NumberInput
          aria-label={inputLabel}
          aria-describedby={error ? errorId : undefined}
          value={displayedDraft}
          min={minimumCents === undefined ? undefined : fromCents(minimumCents)}
          allowNegative={minimumCents === undefined || minimumCents < 0}
          size="xs"
          thousandSeparator=","
          prefix="$"
          decimalScale={2}
          fixedDecimalScale
          hideControls
          disabled={disabled || isSaving}
          classNames={inputClassName ? { input: inputClassName } : undefined}
          styles={{ input: { textAlign: 'right' } }}
          onChange={(value) => {
            setDraft(value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitEdit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEdit();
            }
          }}
        />
        {showActions ? (
          <>
            <ActionIcon
              variant="light"
              color="green"
              aria-label={saveLabel}
              loading={isSaving}
              disabled={disabled}
              onClick={() => void commitEdit()}
            >
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={cancelLabel}
              disabled={disabled || isSaving}
              onClick={cancelEdit}
            >
              <IconX size={16} />
            </ActionIcon>
          </>
        ) : null}
      </Group>
      {error ? (
        <Text id={errorId} role="alert" c="red" size="xs">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
