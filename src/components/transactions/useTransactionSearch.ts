import { useEffect, useRef, useState } from 'react';
import { useCallbackRef } from '@mantine/hooks';

const TRANSACTION_SEARCH_SETTLE_MS = 900;

export function useTransactionSearch(args: {
  value: string;
  onCommit: (value: string) => void;
  onBeforeCommit: () => void;
}) {
  const [input, setInput] = useState(() => ({
    externalValue: args.value,
    draft: args.value,
  }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommit = useCallbackRef(args.onCommit);
  const onBeforeCommit = useCallbackRef(args.onBeforeCommit);

  if (input.externalValue !== args.value) {
    setInput({
      externalValue: args.value,
      draft: args.value,
    });
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const commit = (value: string) => {
    onBeforeCommit();
    onCommit(value);
  };

  const queue = (value: string) => {
    setInput((current) => ({ ...current, draft: value }));
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!value.trim()) {
      setInput((current) => ({ ...current, draft: '' }));
      commit('');
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const committedValue = value.trim().length >= 2 ? value : '';
      commit(committedValue);
    }, TRANSACTION_SEARCH_SETTLE_MS);
  };

  return {
    searchInput: input.draft,
    queueSearch: queue,
  };
}
