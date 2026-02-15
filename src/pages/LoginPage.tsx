import React, { useMemo, useState } from "react";
import { Badge, Button, Container, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { useAppStore } from "../context/AppStore";

export default function LoginPage(props: { onSuccess: () => void; onCancel: () => void }) {
  const { onSuccess, onCancel } = props;
  const store = useAppStore();

  const userOptions = useMemo(() => {
    return store.users.map((u) => {
      const primary = store.getPrimaryCompanyForUser(u.id);
      const company = primary ? store.companies.find((c) => c.id === primary.companyId)?.name ?? primary.companyId : "—";
      const role = primary?.role ?? "—";
      return {
        value: u.id,
        label: `${u.name} (${u.email})`,
        company,
        role,
      };
    });
  }, [store]);

  const [userId, setUserId] = useState<string | null>(store.currentUserId);

  const selected = userOptions.find((u) => u.value === userId);

  return (
    <Container size={520} py={64}>
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={3}>Log in</Title>
          <Text size="sm" c="dimmed">
            Prototype auth: select a user. No password required.
          </Text>

          <Select
            label="User"
            data={userOptions.map((u) => ({ value: u.value, label: u.label }))}
            value={userId}
            onChange={setUserId}
            searchable
          />

          <Group gap="sm">
            <Badge variant="light">Company: {selected?.company ?? "—"}</Badge>
            <Badge variant="light">Role: {selected?.role ?? "—"}</Badge>
          </Group>

          <Button
            onClick={() => {
              if (!userId) return;
              store.setCurrentUserId(userId);
              onSuccess();
            }}
          >
            Log in
          </Button>
          <Button variant="subtle" onClick={onCancel}>
            Back
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
