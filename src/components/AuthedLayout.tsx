import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import {
  AppShell,
  Box,
  Button,
  Container,
  Menu,
  Stack,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import {
  accountRoute,
  companyRoute,
  homeRoute,
  landingRoute,
  loginRoute,
  smokeRoute,
} from '../router';
import { asCompanyId } from '../types/ids';
import {
  getDefaultCompanyIdForUser,
  useCompaniesQuery,
} from '../queries/reference';
import { useLogoutMutation, useSessionQuery } from '../queries/session';
import { useCurrentUserQuery } from '../queries/account';
import { useIsHydrated } from '../hooks/useIsHydrated';
import { ColorSchemeMenuItem, ColorSchemeToggle } from './ColorSchemeControl';
import classes from '../styles/ui.module.css';

const smokeToolsEnabled = import.meta.env.VITE_ENABLE_SMOKE_TOOLS === 'true';

/**
 * Authenticated app chrome. Kept behind the authenticated route boundary so
 * public pages do not download its navigation, account queries, or UI widgets.
 */
export default function AuthedLayout() {
  const session = useSessionQuery();
  const logout = useLogoutMutation();
  const router = useRouter();
  const isHydrated = useIsHydrated();

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
          Record<string, unknown> | undefined;
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
                aria-label="Workspace"
                disabled={!isHydrated}
                onClick={async () => {
                  if (isSuperadmin || companyCount > 1) {
                    await router.navigate({ to: landingRoute.to });
                    return;
                  }

                  // Prefer current company from URL, otherwise fall back to user's default company.
                  const companyId =
                    companyIdFromUrl ?? (await getDefaultCompanyIdForUser());
                  if (companyId) {
                    await router.navigate({
                      to: companyRoute.to,
                      params: { companyId },
                    });
                  } else {
                    await router.navigate({ to: homeRoute.to });
                  }
                }}
              >
                Workspace
              </Button>
              <Box visibleFrom="sm">
                <ColorSchemeToggle />
              </Box>
              <div className={classes.accountMenuWrap}>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <Button
                      variant="subtle"
                      px="sm"
                      aria-label="Account"
                      disabled={!isHydrated}
                    >
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
                    <ColorSchemeMenuItem />
                    <Menu.Divider />
                    <Menu.Item
                      onClick={() => {
                        void router.navigate({ to: accountRoute.to });
                      }}
                    >
                      Account settings
                    </Menu.Item>
                    {smokeToolsEnabled && isSuperadmin ? (
                      <Menu.Item
                        onClick={() => {
                          void router.navigate({ to: smokeRoute.to });
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
