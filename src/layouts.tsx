import { lazy, Suspense } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import {
  AppShell,
  Button,
  Container,
  Menu,
  Stack,
  Text,
  MantineProvider,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { QueryClientProvider } from '@tanstack/react-query';

import {
  accountRoute,
  companyRoute,
  homeRoute,
  landingRoute,
  loginRoute,
  smokeRoute,
} from './router';
import { theme } from './theme';
import { asCompanyId } from './types/ids';
import { getDefaultCompanyIdForUser } from './queries/reference';
import { useLogoutMutation, useSessionQuery } from './queries/session';
import { useCompaniesQuery } from './queries/reference';
import { useCurrentUserQuery } from './queries/account';
import classes from './styles/ui.module.css';

const smokeToolsEnabled = import.meta.env.VITE_ENABLE_SMOKE_TOOLS === 'true';
const devtoolsEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === 'true';
const Devtools = devtoolsEnabled
  ? lazy(async () => import('./components/Devtools'))
  : null;

/** Root layout: intentionally minimal to keep route config clean. */
export function RootProviders({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
}) {
  const router = useRouter();
  const activeQueryClient = queryClient ?? router.options.context.queryClient;

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={activeQueryClient}>
        {children}
      </QueryClientProvider>
    </MantineProvider>
  );
}

export function RootLayout() {
  return (
    <>
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </>
  );
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
  const isMobile = useMediaQuery('(max-width: 48em)');
  const companiesQ = useCompaniesQuery(userId ?? undefined);
  const currentUserQ = useCurrentUserQuery();

  const companyCount = (companiesQ.data ?? []).length;
  const currentUser = currentUserQ.data ?? null;
  const isSuperadmin = currentUser?.isGlobalSuperadmin === true;

  // Prefer companyId from the active route match (project route also includes companyId).
  // We avoid route.useMatch() here to keep types aligned across router versions and to
  // prevent throwing when the current route doesn't match.
  const companyIdFromUrl = useRouterState({
    select: (s) => {
      // Search from deepest match outward.
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const params = s.matches[i]?.params as
          | Record<string, unknown>
          | undefined;
        const raw = params?.companyId;
        if (typeof raw === 'string') return asCompanyId(raw);
      }
      return null;
    },
  });

  async function handleLogout() {
    await logout.mutateAsync({});
    await router.invalidate();
    await router.navigate({ to: loginRoute.to, replace: true });
  }

  return (
    <AppShell padding={0} header={{ height: isMobile ? 64 : 70 }}>
      <AppShell.Header className={classes.shellHeader}>
        <Container size="xl" className={classes.shellBar}>
          <div className={classes.shellTopRow}>
            <div className={classes.brand}>
              <span className={classes.brandMark}>PX</span>
              <Stack gap={0}>
                <Text className={classes.brandTitle}>ProjEx</Text>
                <Text className={classes.brandEyebrow} visibleFrom="sm">
                  Project expense control
                </Text>
              </Stack>
            </div>

            <div className={classes.shellActions}>
              <Button
                variant="default"
                onClick={async () => {
                  if (isSuperadmin || companyCount > 1) {
                    router.navigate({ to: landingRoute.to });
                    return;
                  }

                  // Prefer current company from URL, otherwise fall back to user's default company.
                  const companyId =
                    companyIdFromUrl ?? (await getDefaultCompanyIdForUser());
                  if (companyId) {
                    router.navigate({
                      to: companyRoute.to,
                      params: { companyId },
                    });
                  } else {
                    router.navigate({ to: homeRoute.to });
                  }
                }}
              >
                Workspace
              </Button>
              <div className={classes.accountMenuWrap}>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <Button variant="subtle" px="sm">
                      <span style={{ fontWeight: 600 }}>Account</span>
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
                    {smokeToolsEnabled && isSuperadmin ? (
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
                      disabled={logout.isPending}
                      onClick={() => {
                        void handleLogout();
                      }}
                    >
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>
          </div>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" className={classes.mainWrap}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
