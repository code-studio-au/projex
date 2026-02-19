import React, { useMemo, useState } from "react";
import { Badge, Group, Paper, Stack, Tabs, Text, Title, Select } from "@mantine/core";
import TransactionsPanel from "./TransactionsPanel";
import BudgetPanel from "./BudgetPanel";
import CsvImporterPanel from "./CsvImporterPanel";
import ProjectSettingsPanel from "./ProjectSettingsPanel";
import { useAppStore } from "../context/AppStore";
import { useBudgets } from "../hooks/useBudgets";
import { useTransactions } from "../hooks/useTransactions";
import { useTaxonomy } from "../hooks/useTaxonomy";
import { useRollups } from "../hooks/useRollups";
import { currency } from "../utils/finance";
import { can } from "../utils/auth";

export default function ProjectWorkspace() {
  const store = useAppStore();
  const projectId = store.activeProjectId;

  if (!projectId) {
    return (
      <Stack>
        <Title order={3}>No project selected</Title>
        <Text c="dimmed">Select a company/project to begin.</Text>
      </Stack>
    );
  }

  const project = store.projects.find((p) => p.id === projectId);
  const company = store.companies.find((c) => c.id === store.activeCompanyId);

  const data = store.getProjectData(projectId);

  // project-scoped models, backed by store
  const budgets = useBudgets({
    companyId: store.activeCompanyId,
    projectId,
    value: data.budgets,
    onChange: (next) => store.setProjectData(projectId, { budgets: next }),
  });

  const txns = useTransactions({
    value: data.transactions,
    onChange: (next) => store.setProjectData(projectId, { transactions: next }),
  });

  const taxonomy = useTaxonomy({
    companyId: store.activeCompanyId,
    projectId,
    valueCategories: data.categories,
    valueSubCategories: data.subCategories,
    onChangeCategories: (next) => store.setProjectData(projectId, { categories: next }),
    onChangeSubCategories: (next) => store.setProjectData(projectId, { subCategories: next }),
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
    () =>
      rollups.monthStarts.map((d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const mk = `${y}-${m}`;
        return { value: mk, label: mk };
      }),
    [rollups.monthStarts]
  );

  const uncoded = useMemo(() => txns.getUncodedSummary(taxonomy.validSubIds), [txns, taxonomy.validSubIds]);

  const canProjectEdit = can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    projectId,
    action: "project:edit",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  });

  const canImport = can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    projectId,
    action: "project:import",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  });

  const canEditBudgets = can({
    userId: store.currentUser.id,
    companyId: store.activeCompanyId,
    projectId,
    action: "budget:edit",
    companyMemberships: store.companyMemberships,
    projectMemberships: store.projectMemberships,
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={3}>
            {company?.name ?? "Company"} • {project?.name ?? "Project"}
          </Title>
          <Text c="dimmed" size="sm">
            Project workspace (transactions, budgets, import)
          </Text>
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
            <Tabs.Tab value="import" disabled={!canImport}>
              Import
            </Tabs.Tab>
            <Tabs.Tab value="settings" disabled={!canProjectEdit}>
              Settings
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="transactions" pt="md">
            <TransactionsPanel
              txns={txns}
              monthFilterKey={monthFilterKey}
              setMonthFilterKey={setMonthFilterKey}
              monthFilterOptions={monthFilterOptions}
              showUncodedOnly={showUncodedOnly}
              setShowUncodedOnly={setShowUncodedOnly}
              uncodedSummary={uncoded}
              readOnly={!can({ userId: store.currentUser.id, companyId: store.activeCompanyId, projectId, action: "txns:edit", companyMemberships: store.companyMemberships, projectMemberships: store.projectMemberships })}
            />
          </Tabs.Panel>

          <Tabs.Panel value="budget" pt="md">
            <BudgetPanel
              projectId={projectId}
              rollups={rollups}
              budgets={budgets}
              uncodedSummary={uncoded}
              readOnly={!canEditBudgets}
            />
          </Tabs.Panel>

          <Tabs.Panel value="import" pt="md">
            <CsvImporterPanel
              existingTxns={txns.transactions}
              companyId={store.activeCompanyId}
              projectId={projectId}
              canEditTaxonomy={can({ userId: store.currentUser.id, companyId: store.activeCompanyId, projectId, action: "taxonomy:edit", companyMemberships: store.companyMemberships, projectMemberships: store.projectMemberships })}
              onReplaceAll={(next) => txns.replaceAll(next)}
              onAppend={(next) => txns.appendMany(next)}
            />
          </Tabs.Panel>
        
          <Tabs.Panel value="settings" pt="md">
            <ProjectSettingsPanel />
          </Tabs.Panel>

        </Tabs>
      </Paper>
    </Stack>
  );
}
