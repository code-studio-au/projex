import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';

import type { CompanySummaryProject, ProjectId } from '../types';

import { calculateBudgetPosition } from '../utils/budgetSemantics';
import { formatCurrencyFromCents } from '../utils/money';
import { LoadingLine } from './LoadingValue';
import classes from '../styles/ui.module.css';

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type FilterOption = { value: string; label: string };

type ProgrammeWorkspaceProps = {
  companyName: string | null;
  projectName: string | null;
  currencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  programmeSummary: CompanySummaryProject | null;
  canViewProgrammeSummary: boolean;
  headerReady: boolean;
  isMobile: boolean;
  yearFilterOptions: FilterOption[];
  yearFilter: string | null;
  quarterFilterOptions: FilterOption[];
  quarterFilter: QuarterOption | null;
  monthFilterOptions: FilterOption[];
  monthFilterKey: string | null;
  onYearFilterChange: (value: string | null) => void;
  onQuarterFilterChange: (value: QuarterOption | null) => void;
  onMonthFilterChange: (value: string | null) => void;
  onOpenProject: (projectId: ProjectId) => void;
};

type PeriodFilters = Pick<
  ProgrammeWorkspaceProps,
  'yearFilter' | 'quarterFilter' | 'monthFilterKey'
>;

function quarterFromMonthKey(monthKey: string): QuarterOption {
  const month = Number(monthKey.slice(5, 7));
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

function monthKeyMatchesFilters(monthKey: string, filters: PeriodFilters) {
  if (filters.monthFilterKey) return monthKey === filters.monthFilterKey;
  if (filters.yearFilter && !monthKey.startsWith(`${filters.yearFilter}-`)) {
    return false;
  }
  if (!filters.quarterFilter) return true;
  return quarterFromMonthKey(monthKey) === filters.quarterFilter;
}

function calculateProgrammePosition(
  project: CompanySummaryProject | null,
  filters: PeriodFilters
) {
  const visibleMonths = (project?.months ?? []).filter((month) =>
    monthKeyMatchesFilters(month.monthKey, filters)
  );
  const budgetCents = project?.budgetCents ?? 0;
  return {
    budgetCents,
    ...calculateBudgetPosition({
      projectBudgetCents: budgetCents,
      codedActualCents: visibleMonths.reduce(
        (total, month) => total + month.actualCodedCents,
        0
      ),
      uncodedExposureCents: visibleMonths.reduce(
        (total, month) => total + month.uncodedAmountCents,
        0
      ),
      uncodedCount: visibleMonths.reduce(
        (total, month) => total + month.uncodedCount,
        0
      ),
      pendingReversalCents: visibleMonths.reduce(
        (total, month) => total + month.pendingReversalCents,
        0
      ),
      pendingReversalCount: visibleMonths.reduce(
        (total, month) => total + month.pendingReversalCount,
        0
      ),
    }),
  };
}

function ProgrammeFilters(
  props: Pick<
    ProgrammeWorkspaceProps,
    | 'isMobile'
    | 'yearFilterOptions'
    | 'yearFilter'
    | 'quarterFilterOptions'
    | 'quarterFilter'
    | 'monthFilterOptions'
    | 'monthFilterKey'
    | 'onYearFilterChange'
    | 'onQuarterFilterChange'
    | 'onMonthFilterChange'
  >
) {
  const {
    isMobile,
    yearFilterOptions,
    yearFilter,
    quarterFilterOptions,
    quarterFilter,
    monthFilterOptions,
    monthFilterKey,
    onYearFilterChange,
    onQuarterFilterChange,
    onMonthFilterChange,
  } = props;
  const hasFilters = Boolean(yearFilter || quarterFilter || monthFilterKey);

  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Title order={5}>Programme rollup</Title>
          <Button
            size="xs"
            variant="light"
            disabled={!hasFilters}
            onClick={() => {
              onYearFilterChange(null);
              onQuarterFilterChange(null);
              onMonthFilterChange(null);
            }}
          >
            Clear filters
          </Button>
        </Group>
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <Select
            label="Year"
            placeholder="All years"
            data={yearFilterOptions}
            value={yearFilter}
            clearable
            onChange={(value) => {
              onYearFilterChange(value);
              onQuarterFilterChange(null);
              onMonthFilterChange(null);
            }}
          />
          <Select
            label="Quarter"
            placeholder="All quarters"
            data={quarterFilterOptions}
            value={quarterFilter}
            clearable
            onChange={(value) => {
              onQuarterFilterChange(
                value === 'Q1' ||
                  value === 'Q2' ||
                  value === 'Q3' ||
                  value === 'Q4'
                  ? value
                  : null
              );
              onMonthFilterChange(null);
            }}
          />
          <Select
            label="Month"
            placeholder="All months"
            data={monthFilterOptions}
            value={monthFilterKey}
            clearable
            onChange={onMonthFilterChange}
          />
        </SimpleGrid>
        {hasFilters ? (
          <Text size="xs" c="dimmed">
            Programme budget remains the full-programme total; spend, exposure,
            headroom, and health reflect the selected period.
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}

function ProgrammeStats(props: {
  childProjectCount: number;
  currencyCode: ProgrammeWorkspaceProps['currencyCode'];
  position: ReturnType<typeof calculateProgrammePosition>;
  isMobile: boolean;
}) {
  const { childProjectCount, currencyCode, position, isMobile } = props;
  return (
    <SimpleGrid cols={isMobile ? 1 : 4} spacing="md">
      <Paper className={classes.statCard} withBorder={false}>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
          Sub-projects
        </Text>
        <Title order={3}>{childProjectCount}</Title>
      </Paper>
      <Paper className={classes.statCard} withBorder={false}>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
          Total budget
        </Text>
        <Title order={4}>
          {formatCurrencyFromCents(position.budgetCents, currencyCode)}
        </Title>
      </Paper>
      <Paper className={classes.statCard} withBorder={false}>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
          Recorded spend
        </Text>
        <Title order={4}>
          {formatCurrencyFromCents(position.recordedSpendCents, currencyCode)}
        </Title>
        <Text size="sm" c="dimmed">
          Uncoded:{' '}
          {formatCurrencyFromCents(position.uncodedExposureCents, currencyCode)}
        </Text>
      </Paper>
      <Paper className={classes.statCard} withBorder={false}>
        <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
          Budget headroom
        </Text>
        <Title order={4}>
          {formatCurrencyFromCents(
            position.confirmedHeadroomCents,
            currencyCode
          )}
        </Title>
        <Badge
          variant="light"
          color={position.health.color}
          title={position.health.reason}
        >
          {position.health.label}
        </Badge>
      </Paper>
    </SimpleGrid>
  );
}

function ChildProjectsTable(props: {
  projects: CompanySummaryProject[];
  filters: PeriodFilters;
  onOpenProject: ProgrammeWorkspaceProps['onOpenProject'];
}) {
  const { projects, filters, onOpenProject } = props;
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="lg">
      <Stack gap="sm">
        <Title order={5}>Sub-projects</Title>
        {projects.length ? (
          <div className="financeTable">
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="table-head-cell table-head-left">
                      Project
                    </Table.Th>
                    <Table.Th className="table-head-cell table-head-right">
                      Budget
                    </Table.Th>
                    <Table.Th className="table-head-cell table-head-right">
                      Recorded spend
                    </Table.Th>
                    <Table.Th className="table-head-cell table-head-right">
                      Budget headroom
                    </Table.Th>
                    <Table.Th className="table-head-cell table-head-left">
                      Health
                    </Table.Th>
                    <Table.Th className="table-head-cell table-head-left">
                      Status
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {projects.map((project) => {
                    const position = calculateProgrammePosition(
                      project,
                      filters
                    );
                    const canOpenProject = project.status === 'active';
                    return (
                      <Table.Tr key={project.id}>
                        <Table.Td>
                          {canOpenProject ? (
                            <button
                              type="button"
                              className={classes.drilldownButton}
                              onClick={() => onOpenProject(project.id)}
                            >
                              <Text
                                component="span"
                                className="table-body-left-bold table-link-text"
                              >
                                {project.name}
                              </Text>
                            </button>
                          ) : (
                            <Text className="table-body-left-bold">
                              {project.name}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text className="table-body-right">
                            {formatCurrencyFromCents(
                              position.budgetCents,
                              project.currency
                            )}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text className="table-body-right">
                            {formatCurrencyFromCents(
                              position.recordedSpendCents,
                              project.currency
                            )}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text className="table-body-right">
                            {formatCurrencyFromCents(
                              position.confirmedHeadroomCents,
                              project.currency
                            )}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={position.health.color}
                            title={position.health.reason}
                          >
                            {position.health.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={
                              project.status === 'active' ? 'green' : 'gray'
                            }
                          >
                            {project.status === 'active'
                              ? 'Active'
                              : 'Archived'}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
        ) : (
          <Text c="dimmed">No sub-projects are assigned yet.</Text>
        )}
      </Stack>
    </Paper>
  );
}

export default function ProgrammeWorkspace(props: ProgrammeWorkspaceProps) {
  const {
    companyName,
    projectName,
    currencyCode,
    programmeSummary,
    canViewProgrammeSummary,
    headerReady,
    isMobile,
    yearFilter,
    quarterFilter,
    monthFilterKey,
  } = props;
  const filters = { yearFilter, quarterFilter, monthFilterKey };
  const childProjects = programmeSummary?.children ?? [];
  const position = calculateProgrammePosition(programmeSummary, filters);

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper
        className={classes.pageHero}
        p={isMobile ? 'md' : 'lg'}
        radius="xl"
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            {headerReady ? (
              <Title order={3} className={classes.pageHeroTitle}>
                {companyName} • {projectName}
              </Title>
            ) : (
              <LoadingLine width={320} height={30} radius="md" />
            )}
            <Badge size={isMobile ? 'md' : 'lg'} variant="light" color="blue">
              Programme
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Programmes are reporting-only containers. Budgets, imports,
            transactions, taxonomy, and coding live in the sub-projects below.
          </Text>
        </Stack>
      </Paper>

      {!canViewProgrammeSummary ? (
        <Paper className={classes.surfaceCard} radius="xl" p="lg">
          <Text c="dimmed">
            Programme rollups are available to company admins, executives, and
            superadmins.
          </Text>
        </Paper>
      ) : (
        <>
          <ProgrammeFilters {...props} />
          <ProgrammeStats
            childProjectCount={childProjects.length}
            currencyCode={currencyCode}
            position={position}
            isMobile={isMobile}
          />
          <ChildProjectsTable
            projects={childProjects}
            filters={filters}
            onOpenProject={props.onOpenProject}
          />
        </>
      )}
    </Stack>
  );
}
