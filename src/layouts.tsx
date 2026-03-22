import { useMemo, useState } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  Center,
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
import { accountRoute, companyRoute, homeRoute, landingRoute, loginRoute, smokeRoute } from './router';
import { theme } from './theme';
import { asCompanyId } from './types/ids';
import { useLogoutMutation, useSessionQuery } from './queries/session';
import { useAllCompanyMembershipsQuery } from './queries/memberships';
import { useCompaniesQuery, useUsersQuery } from './queries/reference';

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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const MIN_SIGN_OUT_OVERLAY_MS = 900;

  const userId = session.data?.userId ?? null;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const membershipsQ = useAllCompanyMembershipsQuery();
  const companiesQ = useCompaniesQuery(userId ?? undefined);
  const usersQ = useUsersQuery();

  const isSuperadmin = (membershipsQ.data ?? []).some(
    (m) => m.userId === userId && m.role === 'superadmin'
  );
  const companyCount = (companiesQ.data ?? []).length;
  const currentUser = useMemo(
    () => (usersQ.data ?? []).find((user) => user.id === userId) ?? null,
    [userId, usersQ.data]
  );
  const accountLabel = isMobile
    ? currentUser?.name?.split(' ')[0] ?? 'Account'
    : currentUser?.name ?? 'Account';

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

  async function handleLogout() {
    const startedAt = Date.now();
    setIsSigningOut(true);
    try {
      await logout.mutateAsync();
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, MIN_SIGN_OUT_OVERLAY_MS - elapsedMs);
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
      }
      await router.navigate({ to: loginRoute.to, replace: true });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <AppShell padding={0} header={{ height: isMobile ? 64 : 70 }}>
      {isSigningOut ? (
        <Center
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 400,
            background:
              'linear-gradient(180deg, rgba(248,250,252,0.82), rgba(241,245,249,0.9))',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Paper
            p="xl"
            radius="xl"
            shadow="md"
            style={{
              width: 'min(28rem, calc(100vw - 2rem))',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
              border: '1px solid rgba(148, 163, 184, 0.22)',
            }}
          >
            <Stack gap="sm" align="center">
              <ThemeIcon
                radius="xl"
                size={56}
                variant="gradient"
                gradient={{ from: 'blue.6', to: 'cyan.5' }}
              >
                PX
              </ThemeIcon>
              <Stack gap={4} align="center">
                <Text fw={800} size="lg">
                  Signing out
                </Text>
                <Text size="sm" c="dimmed" ta="center">
                  Wrapping up your session and taking you back to the login screen.
                </Text>
              </Stack>
              <Text
                size="xs"
                tt="uppercase"
                fw={700}
                c="blue.7"
                style={{ letterSpacing: '0.08em' }}
              >
                Please wait
              </Text>
            </Stack>
          </Paper>
        </Center>
      ) : null}
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
                    ProjEx
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.1} visibleFrom="sm">
                    Project Expense Tracker
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
                      <Text fw={600}>{accountLabel}</Text>
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Account</Menu.Label>
                    {currentUser ? (
                      <Menu.Item disabled>
                        <Stack gap={0}>
                          <Text fw={600} size="sm">
                            {currentUser.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {currentUser.email}
                          </Text>
                        </Stack>
                      </Menu.Item>
                    ) : null}
                    <Menu.Item
                      onClick={() => {
                        router.navigate({ to: accountRoute.to });
                      }}
                    >
                      Account settings
                    </Menu.Item>
                    {isSuperadmin ? (
                      <Menu.Item
                        onClick={() => {
                          router.navigate({ to: smokeRoute.to });
                        }}
                      >
                        System checks
                      </Menu.Item>
                    ) : null}
                    <Menu.Item
                      color="red"
                      disabled={isSigningOut}
                      onClick={() => {
                        void handleLogout();
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
