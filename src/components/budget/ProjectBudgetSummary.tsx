import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';

import {
  calculateAllocationPosition,
  calculateBudgetPosition,
} from '../../utils/budgetSemantics';
import { formatCurrencyFromCents } from '../../utils/money';
import { LoadingLine } from '../LoadingValue';
import MoneyAmountEditor from '../finance/MoneyAmountEditor';
import classes from '../../styles/ui.module.css';

type ProjectBudgetSummaryProps = {
  currencyCode: string;
  projectBudgetTotalCents: number;
  projectAllocatedCents: number;
  projectActualCents: number;
  uncodedSummary: { count: number; amountCents: number };
  pendingReversalCount: number;
  pendingReversalCents: number;
  hasPeriodFilter: boolean;
  isLoading: boolean;
  canEditProjectBudgetTotal: boolean;
  onUpdateProjectBudgetTotal?: (budgetTotalCents: number) => Promise<void>;
};

export default function ProjectBudgetSummary(props: ProjectBudgetSummaryProps) {
  const {
    currencyCode,
    projectBudgetTotalCents,
    projectAllocatedCents,
    projectActualCents,
    uncodedSummary,
    pendingReversalCount,
    pendingReversalCents,
    hasPeriodFilter,
    isLoading,
    canEditProjectBudgetTotal,
    onUpdateProjectBudgetTotal,
  } = props;
  const [isEditingProjectBudget, setIsEditingProjectBudget] = useState(false);

  const allocationPosition = calculateAllocationPosition({
    projectBudgetCents: projectBudgetTotalCents,
    allocatedBudgetCents: projectAllocatedCents,
  });
  const budgetPosition = calculateBudgetPosition({
    projectBudgetCents: projectBudgetTotalCents,
    codedActualCents: projectActualCents,
    uncodedExposureCents: uncodedSummary.amountCents,
    uncodedCount: uncodedSummary.count,
    pendingReversalCount,
    pendingReversalCents,
  });

  return (
    <Paper
      className={`${classes.surfaceCard} budgetSummaryCard`}
      radius="xl"
      p="md"
    >
      <Stack gap="xs">
        <Group justify="space-between" align="center" wrap="wrap">
          <Text className={classes.sectionEyebrow}>Project totals</Text>
          {!isLoading ? (
            <Badge
              variant="light"
              color={budgetPosition.health.color}
              title={budgetPosition.health.reason}
            >
              {budgetPosition.health.label}
            </Badge>
          ) : null}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Paper
            withBorder={false}
            className={`${classes.statCard} budgetMetricCard budgetSummaryPrimary`}
          >
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Project budget
              </Text>
              {canEditProjectBudgetTotal &&
              onUpdateProjectBudgetTotal &&
              isEditingProjectBudget ? (
                <MoneyAmountEditor
                  amountCents={projectBudgetTotalCents}
                  minimumCents={0}
                  inputLabel="Project budget total"
                  saveLabel="Save project budget total"
                  cancelLabel="Cancel editing project budget total"
                  alwaysShowActions
                  inputClassName="budgetSummaryInput"
                  onSave={onUpdateProjectBudgetTotal}
                  onSaved={() => setIsEditingProjectBudget(false)}
                  onCancel={() => setIsEditingProjectBudget(false)}
                />
              ) : (
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text fw={800} size="xl">
                    {formatCurrencyFromCents(
                      projectBudgetTotalCents,
                      currencyCode
                    )}
                  </Text>
                  {canEditProjectBudgetTotal ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Edit project budget total"
                      disabled={!onUpdateProjectBudgetTotal}
                      onClick={() => setIsEditingProjectBudget(true)}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  ) : null}
                </Group>
              )}
              <Text size="sm" c="dimmed">
                Approved full project funding
              </Text>
            </Stack>
          </Paper>

          <Paper
            withBorder={false}
            className={`${classes.statCard} budgetMetricCard`}
          >
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Allocated budget
              </Text>
              <Text component="div" fw={800} size="lg">
                {isLoading ? (
                  <LoadingLine width={120} height={28} radius="md" />
                ) : (
                  formatCurrencyFromCents(projectAllocatedCents, currencyCode)
                )}
              </Text>
              {isLoading ? (
                <>
                  <LoadingLine width={150} height={16} />
                  <LoadingLine width={120} height={16} />
                </>
              ) : (
                <>
                  <Text
                    size="sm"
                    c={
                      (allocationPosition.allocationCoveragePct ?? 0) > 100
                        ? 'red'
                        : 'dimmed'
                    }
                  >
                    {allocationPosition.allocationCoveragePct === null
                      ? 'No project budget set'
                      : `${allocationPosition.allocationCoveragePct.toFixed(1)}% assigned`}
                  </Text>
                  <Text
                    size="sm"
                    c={
                      allocationPosition.unallocatedBudgetCents < 0
                        ? 'red'
                        : 'dimmed'
                    }
                  >
                    Unallocated:{' '}
                    {formatCurrencyFromCents(
                      allocationPosition.unallocatedBudgetCents,
                      currencyCode
                    )}
                  </Text>
                </>
              )}
            </Stack>
          </Paper>

          <Paper
            withBorder={false}
            className={`${classes.statCard} budgetMetricCard`}
          >
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Recorded spend
              </Text>
              <Text component="div" fw={800} size="lg">
                {isLoading ? (
                  <LoadingLine width={120} height={28} radius="md" />
                ) : (
                  formatCurrencyFromCents(
                    budgetPosition.recordedSpendCents,
                    currencyCode
                  )
                )}
              </Text>
              {isLoading ? (
                <>
                  <LoadingLine width={150} height={16} />
                  <LoadingLine width={130} height={16} />
                </>
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    Coded:{' '}
                    {formatCurrencyFromCents(
                      budgetPosition.codedActualCents,
                      currencyCode
                    )}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Uncoded exposure:{' '}
                    {formatCurrencyFromCents(
                      budgetPosition.uncodedExposureCents,
                      currencyCode
                    )}
                  </Text>
                </>
              )}
            </Stack>
          </Paper>

          <Paper
            withBorder={false}
            className={`${classes.statCard} budgetMetricCard`}
          >
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Budget headroom
              </Text>
              <Text
                component="div"
                fw={800}
                size="lg"
                c={
                  budgetPosition.confirmedHeadroomCents < 0 ? 'red' : undefined
                }
              >
                {isLoading ? (
                  <LoadingLine width={120} height={28} radius="md" />
                ) : (
                  formatCurrencyFromCents(
                    budgetPosition.confirmedHeadroomCents,
                    currencyCode
                  )
                )}
              </Text>
              {isLoading ? (
                <>
                  <LoadingLine width={140} height={16} />
                  <LoadingLine width={135} height={16} />
                </>
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    {budgetPosition.spendUtilizationPct === null
                      ? 'Set a budget to calculate utilization'
                      : `${budgetPosition.spendUtilizationPct.toFixed(1)}% used`}
                  </Text>
                  {budgetPosition.pendingReversalCents > 0 ? (
                    <Text size="sm" c="dimmed">
                      Expected after pending reversals:{' '}
                      {formatCurrencyFromCents(
                        budgetPosition.expectedHeadroomAfterPendingReversalsCents,
                        currencyCode
                      )}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      {budgetPosition.health.reason}
                    </Text>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>

        {hasPeriodFilter ? (
          <Text size="xs" c="dimmed">
            Project budget and allocations remain full-project totals; spend,
            exposure, headroom, and health reflect the selected period.
          </Text>
        ) : null}

        {projectAllocatedCents > projectBudgetTotalCents ? (
          <Alert color="red" variant="light" radius="md">
            Budget allocations exceed the project budget by{' '}
            {formatCurrencyFromCents(
              projectAllocatedCents - projectBudgetTotalCents,
              currencyCode
            )}
            .
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}
