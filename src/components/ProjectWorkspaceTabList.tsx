import { Tabs } from '@mantine/core';

export default function ProjectWorkspaceTabList(props: {
  canImport: boolean;
  canProjectEdit: boolean;
}) {
  const { canImport, canProjectEdit } = props;

  return (
    <Tabs.List>
      <Tabs.Tab value="budget">Budget</Tabs.Tab>
      <Tabs.Tab value="transactions">Transactions</Tabs.Tab>
      <Tabs.Tab value="import" disabled={!canImport}>
        Import
      </Tabs.Tab>
      <Tabs.Tab value="settings" disabled={!canProjectEdit}>
        Settings
      </Tabs.Tab>
    </Tabs.List>
  );
}
