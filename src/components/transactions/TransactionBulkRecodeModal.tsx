import { Button, Group, Modal, Stack, Text } from '@mantine/core';

import ModalSelect from '../ModalSelect';

export default function TransactionBulkRecodeModal(props: {
  opened: boolean;
  categoryId: string | null;
  subCategoryId: string | null;
  categoryOptions: Array<{ value: string; label: string }>;
  subCategoryOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onCategoryChange: (value: string | null) => void;
  onSubCategoryChange: (value: string | null) => void;
  onSubmit: () => Promise<void>;
}) {
  const {
    opened,
    categoryId,
    subCategoryId,
    categoryOptions,
    subCategoryOptions,
    onClose,
    onCategoryChange,
    onSubCategoryChange,
    onSubmit,
  } = props;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Bulk recode selected transactions"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Recode the selected unlocked, categorisable transactions to a single
          category and subcategory. Locked or ineligible rows will be skipped
          and reported in the result.
        </Text>
        <ModalSelect
          label="Category"
          data={categoryOptions}
          value={categoryId}
          placeholder="Select category"
          searchable
          clearable
          onChange={(value) => {
            onCategoryChange(value);
            onSubCategoryChange(null);
          }}
        />
        <ModalSelect
          label="Subcategory"
          data={subCategoryOptions}
          value={subCategoryId}
          placeholder={
            categoryId ? 'Select subcategory' : 'Select a category first'
          }
          searchable
          clearable
          disabled={!categoryId}
          onChange={onSubCategoryChange}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!categoryId || !subCategoryId}
            onClick={() => {
              void onSubmit();
            }}
          >
            Recode selected
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
