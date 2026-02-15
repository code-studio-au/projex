import React, { useMemo, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Container,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { AppStoreProvider, useAppStore } from "./context/AppStore";
import CompanyDashboard from "./components/CompanyDashboard";
import ProjectWorkspace from "./components/ProjectWorkspace";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import { can } from "./utils/auth";

type AuthedRoute = "dashboard" | "workspace" | "appSettings";

function AuthedShell(props: { onLogout: () => void }) {
  const { onLogout } = props;
  const store = useAppStore();
  const activeCompany = useMemo(() => store.companies.find((c) => c.id === store.activeCompanyId), [store.companies, store.activeCompanyId]);

  const companyId = store.getUserCompanyId(store.currentUser.id) ?? store.activeCompanyId;
  const company = useMemo(() => store.companies.find((c) => c.id === companyId), [store.companies, companyId]);
  const companyRole = store.getUserCompanyRole(store.currentUser.id);

  const [route, setRoute] = useState<AuthedRoute>("dashboard");

  const projectsForCompany = useMemo(
    () => store.projects.filter((p) => p.companyId === companyId),
    [store.projects, companyId]
  );

  const canOpenWorkspace = useMemo(() => {
    if (!store.activeProjectId) return false;
    return can({
      userId: store.currentUser.id,
      companyId,
      projectId: store.activeProjectId,
      action: "project:view",
      companyMemberships: store.companyMemberships,
      projectMemberships: store.projectMemberships,
    });
  }, [store, companyId]);

  const isOwner = store.isAppOwner(store.currentUser.id);

  let body: React.ReactNode = null;
  if (route === "dashboard") {
    body = (
      <CompanyDashboard
        onOpenProject={(_projectId) => {
          setRoute("workspace");
        }}
      />
    );
  } else if (route === "workspace") {
    body = <ProjectWorkspace key={store.activeProjectId ?? "none"} />;
  } else if (route === "appSettings") {
    body = <SuperAdminPage onBack={() => setRoute("dashboard")} />;
  }

  const header = (
    <Paper withBorder radius={0} p="md">
      <Container size="xl">
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon radius="md" size="lg" variant="light">
              PX
            </ThemeIcon>
            <Stack gap={0}>
              <Text fw={800}>{company?.name ?? "Company"}</Text>
              <Text size="xs" c="dimmed">
                Projex
              </Text>
            </Stack>

            <Group gap="sm" ml="md">
              <Button variant={route === "dashboard" ? "filled" : "light"} onClick={() => setRoute("dashboard")}>
                Dashboard
              </Button>
              <Button
                variant={route === "workspace" ? "filled" : "light"}
                onClick={() => setRoute("workspace")}
                disabled={!canOpenWorkspace}
              >
                Workspace
              </Button>
            </Group>
          </Group>

          <Group gap="sm">
<Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="subtle">
                  <Group gap="xs">
                    <Text fw={600}>{store.currentUser.name}</Text>
                    <Badge variant="light">{companyRole ?? "member"}</Badge>
                  </Group>
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Account</Menu.Label>
                {isOwner && <Menu.Item onClick={() => setRoute("appSettings")}>App settings</Menu.Item>}
                {isOwner && <Menu.Divider />}
                <Menu.Item color="red" onClick={onLogout}>
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Container>
    </Paper>
  );

  return (
    <AppShell padding={0} header={{ height: 84 }}>
      <AppShell.Header>{header}</AppShell.Header>
      <AppShell.Main>
        <Container size="xl" py="lg">
          {body}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function Root() {
  const [route, setRoute] = useState<"landing" | "login">("landing");
  const [isAuthed, setAuthed] = useState(false);

  if (!isAuthed) {
    if (route === "login") {
      return (
        <LoginPage
          onSuccess={() => {
            setAuthed(true);
            setRoute("landing");
          }}
          onCancel={() => setRoute("landing")}
        />
      );
    }
    return <LandingPage onLogin={() => setRoute("login")} onSignUp={() => setRoute("login")} />;
  }

  return (
    <AuthedShell
      onLogout={() => {
        setAuthed(false);
        setRoute("landing");
      }}
    />
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Root />
    </AppStoreProvider>
  );
}
