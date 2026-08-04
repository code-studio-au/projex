import { Select, type SelectProps } from '@mantine/core';

type ModalSelectProps = Omit<
  SelectProps,
  'comboboxProps' | 'styles' | 'withScrollArea'
>;

export default function ModalSelect(props: ModalSelectProps) {
  return (
    <Select
      {...props}
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
