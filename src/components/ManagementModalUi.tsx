import type { ReactNode } from 'react';
import { ActionIcon, Group, Menu, Paper, Stack, Text } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';

import classes from '../styles/ui.module.css';

export function ManagementModalIntro(props: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="md" className={classes.modalCard}>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={4} className={classes.fieldGrow}>
          <Text fw={600}>{props.title}</Text>
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            {props.children}
          </Text>
        </Stack>
        {props.action}
      </Group>
    </Paper>
  );
}

export function ManagementActionsMenu(props: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={props.label}
          title={props.label}
        >
          <IconDotsVertical size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{props.children}</Menu.Dropdown>
    </Menu>
  );
}

export function ManagementListCard(props: {
  title: ReactNode;
  metadata?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="sm" className={classes.managementListCard}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Stack gap={4} className={classes.fieldGrow}>
          {props.badges ? (
            <Group gap="xs" wrap="wrap">
              {props.badges}
            </Group>
          ) : null}
          <Text fw={600}>{props.title}</Text>
          {props.metadata}
        </Stack>
        {props.actions}
      </Group>
    </Paper>
  );
}
