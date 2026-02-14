import React, { useMemo, useState } from "react";
import { Box, Badge, Button, Group, Paper, Stack, Tabs, Text, Title, Select } from "@mantine/core";
import { seedBudgets, seedCategories, seedSubCategories, seedTransactions } from "../data/seedData";
import { useBudgets } from "../hooks/useBudgets";
import { useTransactions } from "../hooks/useTransactions";
import { useTaxonomy } from "../hooks/useTaxonomy";
import { useRollups } from "../hooks/useRollups";
import { currency } from "../utils/finance";
import TransactionsPanel from "./TransactionsPanel";
import BudgetPanel from "./BudgetPanel";
import CsvImporterPanel from "./CsvImporterPanel";

export default function Dashboard() {
  const budgets = useBudgets(seedBudgets);
  const txns = useTransactions(seedTransactions);

  const taxonomy = useTaxonomy({
    initialCategories: seedCategories,
    initialSubCategories: seedSubCategories,
    budgets,
    txns,
  });

  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(null);
  const [showUncodedOnly, setShowUncodedOnly] = useState(false);

  const rollups = useRollups({
    transactions: txns.transactions,
    budgets: budgets.budgets,
    taxonomy,
    monthFilterKey,
  });

  const monthFilterOptions = useMemo(
    () => rollups.monthStarts.map((d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const mk = `${y}-${m}`;
      return { value: mk, label: mk };
    }),
    [rollups.monthStarts]
  );

  const uncoded = useMemo(() => txns.getUncodedSummary(taxonomy.validSubIds), [txns, taxonomy.validSubIds]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={3}>Non-Salary Expense Tracker</Title>
          <Text c="dimmed" size="sm">Code transactions → roll up to monthly/quarter/year budget views</Text>
        </Stack>

        <Group gap="sm">
          <Badge size="lg" variant="light" color={uncoded.count ? "red" : "gray"}>
            Uncoded: {uncoded.count} ({currency(uncoded.amount)})
          </Badge>
        </Group>
      </Group>

      <Paper withBorder radius="md" p="md">
        <Tabs defaultValue="transactions" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="transactions">Transactions</Tabs.Tab>
            <Tabs.Tab value="budget">Budget</Tabs.Tab>
            <Tabs.Tab value="import">Import</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="transactions" pt="md">
            <TransactionsPanel
              txns={txns}
              taxonomy={taxonomy}
              monthFilterKey={monthFilterKey}
              setMonthFilterKey={setMonthFilterKey}
              monthFilterOptions={monthFilterOptions}
              showUncodedOnly={showUncodedOnly}
              setShowUncodedOnly={setShowUncodedOnly}
              uncodedSummary={uncoded}
            />
          </Tabs.Panel>

          <Tabs.Panel value="budget" pt="md">
            <BudgetPanel
              rollups={rollups}
              budgets={budgets}
              taxonomy={taxonomy}
              uncodedSummary={uncoded}
            />
          </Tabs.Panel>

          <Tabs.Panel value="import" pt="md">
            <CsvImporterPanel
              taxonomy={taxonomy}
              existingTxns={txns.transactions}
              onReplaceAll={(next) => txns.replaceAll(next)}
              onAppend={(next) => txns.appendMany(next)}
            />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
