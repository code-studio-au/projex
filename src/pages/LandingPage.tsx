import React from 'react';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';

export default function LandingPage(props: {
  onLogin: () => void;
  onSignUp: () => void;
}) {
  const { onLogin, onSignUp } = props;

  return (
    <Box>
      <Paper withBorder radius={0} p="md">
        <Container size="xl">
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon radius="md" size="lg" variant="light">
                PX
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={700}>Projex</Text>
                <Text size="xs" c="dimmed">
                  Multi-tenant budgets & transactions
                </Text>
              </Stack>
            </Group>

            <Group gap="sm">
              <Button variant="subtle" onClick={onLogin}>
                Log in
              </Button>
              <Button onClick={onSignUp}>Sign up</Button>
            </Group>
          </Group>
        </Container>
      </Paper>

      <Container size="xl">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" py={64}>
          <Stack gap="md">
            <Badge variant="light" w="fit-content">
              CSV import • Dedupe IDs • RBAC
            </Badge>
            <Title order={1} style={{ lineHeight: 1.1 }}>
              Budget clarity across every company project.
            </Title>
            <Text c="dimmed" size="lg">
              Track spend, keep budgets tight, and give executives a portfolio
              dashboard — without losing the day-to-day project workflow.
            </Text>
            <Group>
              <Button size="md" onClick={onSignUp}>
                Get started
              </Button>
              <Button size="md" variant="light" onClick={onLogin}>
                Log in
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              Prototype mode: demo users + roles, no real password required.
            </Text>
          </Stack>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <Title order={4}>What you can do</Title>
              <SimpleGrid cols={2} spacing="sm">
                <Paper withBorder radius="md" p="md">
                  <Text fw={600}>Import</Text>
                  <Text size="sm" c="dimmed">
                    stable IDs + dedupe
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text fw={600}>Code</Text>
                  <Text size="sm" c="dimmed">
                    fast uncoded workflow
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text fw={600}>Budget</Text>
                  <Text size="sm" c="dimmed">
                    allocated vs actual
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Text fw={600}>Portfolio</Text>
                  <Text size="sm" c="dimmed">
                    exec dashboard
                  </Text>
                </Paper>
              </SimpleGrid>
              <Divider />
              <Text size="sm" c="dimmed">
                Next: persistence, real auth, background import jobs.
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Stack gap="md" pb={56}>
          <Title order={2}>Features</Title>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {[
              {
                title: 'Multi-project workflow',
                body: 'Switch between projects without losing context.',
              },
              {
                title: 'Role-based access',
                body: 'Exec + project lead combinations work as expected.',
              },
              {
                title: 'Clean reporting',
                body: 'Uncoded summaries and budget rollups drive action.',
              },
            ].map((f) => (
              <Paper key={f.title} withBorder radius="lg" p="lg">
                <Text fw={700}>{f.title}</Text>
                <Text size="sm" c="dimmed" mt={6}>
                  {f.body}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap="md" pb={56}>
          <Title order={2}>Pricing</Title>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {[
              {
                tier: 'Starter',
                price: '$0',
                blurb: 'Prototype / personal use.',
                cta: 'Try demo',
              },
              {
                tier: 'Team',
                price: '$19',
                blurb: 'Per project/month with RBAC.',
                cta: 'Start trial',
              },
              {
                tier: 'Enterprise',
                price: 'Custom',
                blurb: 'SSO, audit, automation & support.',
                cta: 'Contact',
              },
            ].map((p) => (
              <Paper key={p.tier} withBorder radius="lg" p="lg">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={0}>
                    <Text fw={700}>{p.tier}</Text>
                    <Text size="xl" fw={800}>
                      {p.price}
                    </Text>
                  </Stack>
                  <Badge variant="light">Monthly</Badge>
                </Group>
                <Text size="sm" c="dimmed" mt="sm">
                  {p.blurb}
                </Text>
                <Button
                  mt="md"
                  variant={p.tier === 'Team' ? 'filled' : 'light'}
                  onClick={onSignUp}
                  fullWidth
                >
                  {p.cta}
                </Button>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap="md" pb={56}>
          <Title order={2}>Partners & testimonials</Title>
          <Group gap="sm" wrap="wrap">
            {['Concur', 'Xero', 'Atlassian', 'Slack', 'AWS'].map((x) => (
              <Badge key={x} variant="light" size="lg">
                {x}
              </Badge>
            ))}
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="sm">
            {[
              {
                quote:
                  'We finally see project variance early — before it becomes a surprise.',
                name: 'Finance Ops',
              },
              {
                quote:
                  'Exec overview + project ownership in one workflow. Exactly what we needed.',
                name: 'COO',
              },
            ].map((t) => (
              <Paper key={t.name} withBorder radius="lg" p="lg">
                <Text fw={600}>&ldquo;{t.quote}&rdquo;</Text>
                <Text size="sm" c="dimmed" mt="sm">
                  — {t.name}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      <Paper withBorder radius={0} p="md">
        <Container size="xl">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              © {new Date().getFullYear()} Projex
            </Text>
            <Group gap="md">
              <Anchor size="sm" c="dimmed">
                Privacy
              </Anchor>
              <Anchor size="sm" c="dimmed">
                Terms
              </Anchor>
              <Anchor size="sm" c="dimmed" onClick={onLogin}>
                Login
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Paper>
    </Box>
  );
}
