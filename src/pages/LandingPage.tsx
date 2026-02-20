import React, { useMemo } from 'react';
import { Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { useSessionQuery } from '../queries/session';
import { api } from '../api';
import { companyRoute } from '../router';
import { useCompaniesQuery } from '../queries/reference';

export default function LandingPage() {
  const session = useSessionQuery();
  const router = useRouter();
  const companiesQ = useCompaniesQuery(session.data?.userId);

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);

  return (
    <Container size="sm">
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={2}>Projex</Title>
          <Text c="dimmed">
            Local-first build with a clean API boundary + TanStack Router/Query. When you swap to
            TanStack Start later, the UI keeps the same shape.
          </Text>

          <Group justify="flex-end">
            {session.data ? (
              <Button
                variant="light"
                onClick={async () => {
                  const companyId = await api.getDefaultCompanyIdForUser(session.data.userId);
                  if (companyId) router.navigate({ to: companyRoute.fullPath, params: { companyId } });
                  else router.navigate({ to: '/login' });
                }}
              >
                Continue
              </Button>
            ) : (
              <Button component={Link} to="/login">
                Login
              </Button>
            )}
          </Group>

          {session.data && (
            <Stack gap="sm" mt="md">
              <Text fw={700}>Companies</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {companies.map((c) => (
                  <Card key={c.id} withBorder radius="lg" p="md">
                    <Stack gap={6}>
                      <Text fw={700}>{c.name}</Text>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {c.id}
                      </Text>
                      <Group justify="flex-end" mt="xs">
                        <Button
                          component={Link}
                          to={companyRoute.fullPath}
                          params={{ companyId: c.id }}
                          variant="filled"
                        >
                          Open
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>

              {companies.length === 0 && (
                <Text c="dimmed" size="sm">
                  No companies available for this user.
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Card>
    </Container>
  );
}
