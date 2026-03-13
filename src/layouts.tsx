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
  MantineProvider,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { QueryClientProvider } from '@tanstack/react-query';

import { useApi } from './hooks/useApi';
import { companyRoute, homeRoute, landingRoute } from './router';
import { theme } from './theme';
import { asCompanyId } from './types/ids';
import { useLogoutMutation, useSessionQuery } from './queries/session';
import { useAllCompanyMembershipsQuery } from './queries/memberships';
import { useCompaniesQuery } from './queries/reference';

/** Root layout: intentionally minimal to keep route config clean. */
export function RootProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={router.options.context.queryClient}>
        {children}
      </QueryClientProvider>
    </MantineProvider>
  );
}

export function RootLayout() {
  return (
    <RootProviders>
      <Outlet />
    </RootProviders>
  );
}

/**
 * Authenticated app chrome.
 *
 * NOTE: session enforcement happens in router `beforeLoad`, but we keep this
 * component defensive for smoother local/dev behavior.
 */
export function AuthedLayout() {
  const api = useApi();
  const session = useSessionQuery();
  const logout = useLogoutMutation();
  const router = useRouter();

  const userId = session.data?.userId ?? null;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const membershipsQ = useAllCompanyMembershipsQuery();
  const companiesQ = useCompaniesQuery(userId ?? undefined);

  const isSuperadmin = (membershipsQ.data ?? []).some(
    (m) => m.userId === userId && m.role === 'superadmin'
  );
  const companyCount = (companiesQ.data ?? []).length;

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
    <AppShell padding={0} header={{ height: isMobile ? 64 : 70 }}>
      <AppShell.Header
        style={{
          borderBottom: 'none',
          background: 'rgba(255,255,255,0.9)',
          overflow: 'hidden',
        }}
      >
        <Paper
          withBorder={false}
          radius={0}
          p="sm"
          h="100%"
          bg="rgba(255,255,255,0.9)"
          style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
        >
          <Container size="xl">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm">
                <ThemeIcon radius="md" size="lg" variant="gradient" gradient={{ from: 'blue.6', to: 'cyan.5' }}>
                  PX
                </ThemeIcon>
                <Stack gap={0}>
                  <Text fw={800} lh={1.1} size={isMobile ? 'md' : 'lg'}>
                    Projex
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.1} visibleFrom="sm">
                    Local mode · server-aligned
                  </Text>
                </Stack>
              </Group>

              <Group gap="sm">
                {userId && (
                  <Button
                    variant="light"
                    onClick={async () => {
                      if (isSuperadmin || companyCount > 1) {
                        router.navigate({ to: landingRoute.to });
                        return;
                      }

                      // Prefer current company from URL, otherwise fall back to user's default company.
                      const companyId = companyIdFromUrl ?? (await api.getDefaultCompanyIdForUser(userId));
                      if (companyId) {
                        router.navigate({ to: companyRoute.to, params: { companyId } });
                      } else {
                        router.navigate({ to: homeRoute.to });
                      }
                    }}
                  >
                    Workspace
                  </Button>
                )}
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <Button variant="subtle" px="sm">
                      <Group gap="xs">
                        <Text fw={600}>{isMobile ? 'Account' : userId ?? 'User'}</Text>
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
                            router.navigate({ to: homeRoute.to });
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
        <Container size="xl" py="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
