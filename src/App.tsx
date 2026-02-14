import { AppShell, Container, Paper, Stack } from "@mantine/core";
import Dashboard from "./components/Dashboard";

export default function App() {
  return (
    <AppShell padding="md">
      <AppShell.Main>
        <Container size="xl">
          <Stack gap="lg">
            <Paper withBorder radius="md" p="lg">
              <Dashboard />
            </Paper>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
