import React from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useAppStore } from "../../context/AppStore";

export default function AppTab() {
  const store = useAppStore();
  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text fw={600}>Local state</Text>
          <Text size="sm" c="dimmed">
            These buttons wipe or reset your localStorage state. Useful during development.
          </Text>
          <Group>
            <Button color="red" variant="light" onClick={store.clearLocalState}>
              Clear local state
            </Button>
            <Button variant="light" onClick={store.applySeedState}>
              Apply seed state
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
