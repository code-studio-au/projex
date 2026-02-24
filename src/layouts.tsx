import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
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
} from '@mantine/core';

import { api } from './api';
import { companyRoute, landingRoute } from './router';
import { asCompanyId } from './types/ids';
import { useLogoutMutation, useSessionQuery } from './queries/session';

/** Root layout: intentionally minimal to keep route config clean. */
export function RootLayout() {
  return <Outlet />;
}

/**
 * Authenticated app chrome.
 *
 * NOTE: session enforcement happens in router `beforeLoad`, but we keep this
 * component defensive for smoother local/dev behavior.
 */
export function AuthedLayout() {
  const session = useSessionQuery();
  const logout = useLogoutMutation();
  const router = useRouter();

  const userId = session.data?.userId ?? null;

  // Prefer companyId from the active route match (project route also includes companyId).
  // We avoid route.useMatch() here to keep types aligned across router versions and to
  // prevent throwing when the current route doesn't match.
  const companyIdFromUrl = useRouterState({
    select: (s) => {
      // Search from deepest match outward.
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const params = s.matches[i]?.params as Record<string, unknown> | undefined;
        const raw = params?.companyId;
        if (typeof raw === 'string') return asCompanyId(raw);
      }
      return null;
    },
  });

  return (
    <AppShell padding={0} header={{ height: 84 }}>
      <AppShell.Header>
        <Paper withBorder radius={0} p="md">
          <Container size="xl">
            <Group justify="space-between">
              <Group gap="sm">
                {userId && (
                  <Button
                    variant="light"
                    onClick={async () => {
                      // Prefer current company from URL, otherwise fall back to user's default company.
                      const companyId =
                        companyIdFromUrl ?? (await api.getDefaultCompanyIdForUser(userId));

                      if (companyId) {
                        router.navigate({ to: companyRoute.to, params: { companyId } });
                      } else {
                        router.navigate({ to: landingRoute.to });
                      }
                    }}
                  >
                    Projects
                  </Button>
                )}

                <ThemeIcon radius="md" size="lg" variant="light">
                  PX
                </ThemeIcon>
                <Stack gap={0}>
                  <Text fw={800}>Projex</Text>
                  <Text size="xs" c="dimmed">
                    Local mode (TanStack-ready)
                  </Text>
                </Stack>
              </Group>

              <Group gap="sm">
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <Button variant="subtle">
                      <Group gap="xs">
                        <Text fw={600}>{userId ?? 'User'}</Text>
                        <Badge variant="light">local</Badge>
                      </Group>
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Account</Menu.Label>
                    <Menu.Item
                      color="red"
                      onClick={() => {
                        logout.mutate(undefined, {
                          onSuccess: () => {
                            router.navigate({ to: landingRoute.to });
                          },
                        });
                      }}
                    >
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          </Container>
        </Paper>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" py="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}