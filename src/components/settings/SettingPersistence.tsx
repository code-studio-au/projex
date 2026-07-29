import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Group, Stack, Switch, Text } from '@mantine/core';

import { mutationErrorMessage, type SavePhase } from './useSettingPersistence';

export function SettingFeedback(props: {
  id: string;
  label: string;
  phase: SavePhase;
  error: string | null;
  errorAction?: ReactNode;
}) {
  const { id, label, phase, error, errorAction } = props;
  if (phase === 'idle') return null;

  if (phase === 'error') {
    return (
      <Stack id={id} gap={4}>
        <Text role="alert" c="red" size="xs">
          {error ?? `Unable to save ${label.toLowerCase()}.`}
        </Text>
        {errorAction}
      </Stack>
    );
  }

  return (
    <Text
      id={id}
      role="status"
      aria-live="polite"
      c={phase === 'saved' ? 'teal' : 'dimmed'}
      size="xs"
    >
      {phase === 'saving'
        ? `Saving ${label.toLowerCase()}…`
        : `${label} saved.`}
    </Text>
  );
}

export function ExplicitSettingActions(props: {
  label: string;
  phase: SavePhase;
  isDirty: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { label, phase, isDirty, onSave, onCancel } = props;
  const isSaving = phase === 'saving';
  return (
    <Group gap="xs">
      <Button size="xs" loading={isSaving} disabled={!isDirty} onClick={onSave}>
        {phase === 'error'
          ? `Retry ${label.toLowerCase()}`
          : `Save ${label.toLowerCase()}`}
      </Button>
      <Button
        size="xs"
        variant="default"
        disabled={isSaving || (!isDirty && phase !== 'error')}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </Group>
  );
}

export function AutoSaveSwitch(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onSave: (checked: boolean) => Promise<void>;
  fallbackError: string;
}) {
  const { label, description, checked, disabled, onSave, fallbackError } =
    props;
  const feedbackId = useId();
  const externalValue = useRef(checked);
  const [confirmed, setConfirmed] = useState(checked);
  const [pending, setPending] = useState<boolean | null>(null);
  const [failedValue, setFailedValue] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<SavePhase>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalValue.current === checked) return;
    externalValue.current = checked;
    setConfirmed(checked);
  }, [checked]);

  async function persist(nextValue: boolean) {
    if (phase === 'saving') return;
    setPending(nextValue);
    setFailedValue(null);
    setError(null);
    setPhase('saving');
    try {
      await onSave(nextValue);
      setConfirmed(nextValue);
      setPending(null);
      setPhase('saved');
    } catch (saveError) {
      setPending(null);
      setFailedValue(nextValue);
      setError(
        `${mutationErrorMessage(saveError, fallbackError)} The previous value was restored.`
      );
      setPhase('error');
    }
  }

  const displayed = pending ?? confirmed;
  const isSaving = phase === 'saving';

  return (
    <Stack gap={4}>
      <Switch
        label={label}
        description={description}
        aria-describedby={phase === 'idle' ? undefined : feedbackId}
        checked={displayed}
        disabled={disabled || isSaving}
        onChange={(event) => void persist(event.currentTarget.checked)}
      />
      <SettingFeedback
        id={feedbackId}
        label={label}
        phase={phase}
        error={error}
        errorAction={
          phase === 'error' && failedValue !== null ? (
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => void persist(failedValue)}
            >
              Retry {label.toLowerCase()}
            </Button>
          ) : undefined
        }
      />
    </Stack>
  );
}
