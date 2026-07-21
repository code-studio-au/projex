import { Button, Group, Select } from '@mantine/core';

import type { QuarterOption } from './transactionsPanelUtils';
import {
  TRANSACTION_VIEW_OPTIONS,
  toTransactionView,
  type TransactionView,
} from './transactionViews';

export default function TransactionFiltersCard(props: {
  isMobile: boolean;
  transactionView: TransactionView;
  setTransactionView: (value: TransactionView) => void;
  yearFilterOptions: { value: string; label: string }[];
  yearFilter: string | null;
  setYearFilter: (value: string | null) => void;
  quarterFilterOptions: { value: QuarterOption; label: string }[];
  quarterFilter: QuarterOption | null;
  setQuarterFilter: (value: QuarterOption | null) => void;
  monthFilterOptions: { value: string; label: string }[];
  monthFilterKey: string | null;
  setMonthFilterKey: (value: string | null) => void;
  onClearFilters: () => void;
  onResetPage: () => void;
  onClearSelection: () => void;
  toQuarterOption: (value: string | null) => QuarterOption | null;
}) {
  const {
    isMobile,
    transactionView,
    setTransactionView,
    yearFilterOptions,
    yearFilter,
    setYearFilter,
    quarterFilterOptions,
    quarterFilter,
    setQuarterFilter,
    monthFilterOptions,
    monthFilterKey,
    setMonthFilterKey,
    onClearFilters,
    onResetPage,
    onClearSelection,
    toQuarterOption,
  } = props;

  return (
    <Group align="flex-end" gap="sm" wrap="wrap">
      <Select
        label="Show"
        data={TRANSACTION_VIEW_OPTIONS}
        value={transactionView}
        allowDeselect={false}
        onChange={(value) => {
          onClearSelection();
          onResetPage();
          setTransactionView(toTransactionView(value));
        }}
        style={{ width: isMobile ? '100%' : 230 }}
      />
      <Select
        label="Year"
        placeholder="All years"
        data={yearFilterOptions}
        value={yearFilter}
        clearable
        onChange={(value) => {
          onClearSelection();
          onResetPage();
          setYearFilter(value);
          setQuarterFilter(null);
          setMonthFilterKey(null);
        }}
        style={{ width: isMobile ? '100%' : 130 }}
      />
      <Select
        label="Quarter"
        placeholder="All quarters"
        data={quarterFilterOptions}
        value={quarterFilter}
        clearable
        disabled={!yearFilter}
        onChange={(value) => {
          onClearSelection();
          onResetPage();
          setQuarterFilter(toQuarterOption(value));
          setMonthFilterKey(null);
        }}
        style={{ width: isMobile ? '100%' : 140 }}
      />
      <Select
        label="Month"
        placeholder="All months"
        data={monthFilterOptions}
        value={monthFilterKey}
        clearable
        onChange={(value) => {
          onClearSelection();
          onResetPage();
          setMonthFilterKey(value);
        }}
        style={{ width: isMobile ? '100%' : 170 }}
      />
      <Button
        size="sm"
        variant="subtle"
        color="gray"
        disabled={!yearFilter && !quarterFilter && !monthFilterKey}
        onClick={() => {
          onClearSelection();
          onResetPage();
          onClearFilters();
        }}
      >
        Clear period
      </Button>
    </Group>
  );
}
