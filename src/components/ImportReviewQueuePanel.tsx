import { useMemo } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type { ProjectId } from '../types';
import {
  useImportCandidatesQuery,
  useReviewImportCandidateMutation,
} from '../queries/importCandidates';
import { formatCurrencyFromCents } from '../utils/money';
import {
  powerBiAmountCents,
  powerBiDescription,
  powerBiItem,
  powerBiTransactionDate,
  toPowerBiExpenditureActualsRow,
} from '../utils/powerBiImport';
import classes from '../styles/ui.module.css';

export default function ImportReviewQueuePanel(props: {
  projectId: ProjectId;
  currencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  enabled: boolean;
}) {
  const { projectId, currencyCode, enabled } = props;
  const candidatesQ = useImportCandidatesQuery(projectId, { enabled });
  const reviewCandidate = useReviewImportCandidateMutation(projectId);

  const pendingCandidates = useMemo(
    () =>
      (candidatesQ.data ?? []).filter(
        (candidate) => candidate.status === 'needs_project_review'
      ),
    [candidatesQ.data]
  );

  if (!enabled) return null;

  return (
    <Paper className={classes.surfaceCard} radius="xl" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Text className={classes.sectionEyebrow}>Review queue</Text>
            <Title order={5} mt={4}>
              Project review queue
            </Title>
          </div>
          <Badge
            variant="light"
            color={pendingCandidates.length ? 'yellow' : 'gray'}
          >
            {pendingCandidates.length} waiting
          </Badge>
        </Group>
        <Text size="sm" c="dimmed" className={classes.filterIntro}>
          These PowerBI rows matched Import Rules that need project context.
          Importing a row creates an uncoded transaction in this project;
          rejecting it keeps the audit trail without affecting the budget.
        </Text>

        {candidatesQ.isError ? (
          <Alert color="red" className={classes.notice}>
            Could not load import review candidates.
          </Alert>
        ) : null}

        {!pendingCandidates.length ? (
          <Text className={classes.emptyState}>
            No PowerBI rows are waiting for project review.
          </Text>
        ) : (
          <Stack gap="sm">
            {pendingCandidates.map((candidate) => {
              const row = toPowerBiExpenditureActualsRow(candidate.rawRow);
              const amount = powerBiAmountCents(row);

              return (
                <Paper
                  key={candidate.id}
                  className={classes.surfaceMuted}
                  withBorder
                  radius="md"
                  p="md"
                >
                  <Stack gap="xs">
                    <Group
                      justify="space-between"
                      align="flex-start"
                      wrap="wrap"
                    >
                      <Stack gap={2}>
                        <Text fw={700}>
                          {powerBiItem(row) || 'PowerBI row'}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {powerBiDescription(row) || 'No description'}
                        </Text>
                      </Stack>
                      <Badge variant="light" color="yellow">
                        Row {candidate.sourceRowIndex}
                      </Badge>
                    </Group>
                    <Group gap="xs" wrap="wrap">
                      <Badge variant="light">
                        {powerBiTransactionDate(row) || 'Missing date'}
                      </Badge>
                      <Badge
                        variant="light"
                        color={amount < 0 ? 'blue' : 'gray'}
                      >
                        {formatCurrencyFromCents(amount, currencyCode)}
                      </Badge>
                      {row.source ? (
                        <Badge variant="light">Source {row.source}</Badge>
                      ) : null}
                      {candidate.statusReason ? (
                        <Badge variant="light" color="yellow">
                          {candidate.statusReason}
                        </Badge>
                      ) : null}
                    </Group>
                    <Group className={classes.footerRow}>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        loading={reviewCandidate.isPending}
                        onClick={() =>
                          reviewCandidate.mutate({
                            candidateId: candidate.id,
                            decision: 'reject',
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        size="xs"
                        loading={reviewCandidate.isPending}
                        onClick={() =>
                          reviewCandidate.mutate({
                            candidateId: candidate.id,
                            decision: 'import',
                          })
                        }
                      >
                        Import row
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
