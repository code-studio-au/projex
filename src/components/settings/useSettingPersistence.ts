import { useEffect, useRef, useState } from 'react';

export type SavePhase = 'idle' | 'saving' | 'saved' | 'error';

export function mutationErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function strictEquals<T>(left: T, right: T) {
  return left === right;
}

export function useExplicitSetting<T>(args: {
  value: T;
  equals: (left: T, right: T) => boolean;
  onSave: (value: T) => Promise<void>;
  fallbackError: string;
}) {
  const { value, equals, onSave, fallbackError } = args;
  const externalValue = useRef(value);
  const [confirmed, setConfirmed] = useState(value);
  const [draft, setDraftState] = useState<T | null>(null);
  const [phase, setPhase] = useState<SavePhase>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (equals(externalValue.current, value)) return;
    externalValue.current = value;
    setConfirmed(value);
  }, [equals, value]);

  const displayed = draft ?? confirmed;
  const isDirty = !equals(displayed, confirmed);

  function setDraft(value: T) {
    if (phase === 'saving') return;
    setDraftState(value);
    setError(null);
    setPhase('idle');
  }

  function cancel() {
    if (phase === 'saving') return;
    setDraftState(null);
    setError(null);
    setPhase('idle');
  }

  async function commit() {
    if (phase === 'saving' || !isDirty) return false;
    const candidate = displayed;
    setError(null);
    setPhase('saving');
    try {
      await onSave(candidate);
      setConfirmed(candidate);
      setDraftState(null);
      setPhase('saved');
      return true;
    } catch (saveError) {
      setError(mutationErrorMessage(saveError, fallbackError));
      setPhase('error');
      return false;
    }
  }

  return {
    confirmed,
    displayed,
    draft,
    error,
    phase,
    isDirty,
    setDraft,
    cancel,
    commit,
  };
}
