import { useCallback, useEffect, useRef } from 'react';
import { Select, type SelectProps } from '@mantine/core';

type ModalSelectProps = Omit<
  SelectProps,
  'comboboxProps' | 'styles' | 'withScrollArea'
>;

function handleContainedWheel(event: WheelEvent) {
  const dropdown = event.currentTarget;
  if (
    !(dropdown instanceof HTMLElement) ||
    dropdown.scrollHeight <= dropdown.clientHeight
  )
    return;

  // WebKit can suppress native overflow scrolling while the modal's document
  // scroll lock is active, so apply and contain the same wheel delta here.
  const deltaPixels =
    event.deltaMode === 1
      ? event.deltaY * 16
      : event.deltaMode === 2
        ? event.deltaY * dropdown.clientHeight
        : event.deltaY;
  const maximumScrollTop = dropdown.scrollHeight - dropdown.clientHeight;
  dropdown.scrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, dropdown.scrollTop + deltaPixels)
  );
  event.preventDefault();
  event.stopPropagation();
}

export default function ModalSelect(props: ModalSelectProps) {
  const { onDropdownClose, onDropdownOpen, ...selectProps } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLElement | null>(null);
  const attachFrameRef = useRef<number | null>(null);

  const detachContainedWheel = useCallback(() => {
    if (attachFrameRef.current !== null) {
      window.cancelAnimationFrame(attachFrameRef.current);
      attachFrameRef.current = null;
    }
    dropdownRef.current?.removeAttribute('data-contained-wheel-scroll');
    dropdownRef.current?.removeEventListener('wheel', handleContainedWheel);
    dropdownRef.current = null;
  }, []);

  useEffect(() => detachContainedWheel, [detachContainedWheel]);

  const attachContainedWheel = () => {
    onDropdownOpen?.();
    detachContainedWheel();
    attachFrameRef.current = window.requestAnimationFrame(() => {
      attachFrameRef.current = null;
      const listboxId = inputRef.current?.getAttribute('aria-controls');
      const listbox = listboxId ? document.getElementById(listboxId) : null;
      const dropdown = listbox?.parentElement;
      if (!dropdown) return;

      dropdown.addEventListener('wheel', handleContainedWheel, {
        passive: false,
      });
      dropdown.setAttribute('data-contained-wheel-scroll', '');
      dropdownRef.current = dropdown;
    });
  };

  return (
    <Select
      {...selectProps}
      ref={inputRef}
      onDropdownOpen={attachContainedWheel}
      onDropdownClose={() => {
        detachContainedWheel();
        onDropdownClose?.();
      }}
      comboboxProps={{ withinPortal: false }}
      withScrollArea={false}
      styles={{
        dropdown: {
          maxHeight: 180,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        },
      }}
    />
  );
}
