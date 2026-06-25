import { Button, Group, Paper, Select } from '@mantine/core';

import type { QuarterOption } from '../TransactionsPanel';
import classes from '../../styles/ui.module.css';

export default function TransactionFiltersCard(props: {
  isMobile: boolean;
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
    <Paper className={classes.filterCard} radius="xl">
      <Group align="flex-end" gap="sm" wrap="wrap">
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
          style={{ width: isMobile ? '100%' : 140 }}
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
          style={{ width: isMobile ? '100%' : 150 }}
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
          style={{ width: isMobile ? '100%' : 180 }}
        />
        <Button
          size="sm"
          variant="subtle"
          disabled={!yearFilter && !quarterFilter && !monthFilterKey}
          onClick={() => {
            onClearSelection();
            onResetPage();
            onClearFilters();
          }}
        >
          Remove filter(s)
        </Button>
      </Group>
    </Paper>
  );
}
