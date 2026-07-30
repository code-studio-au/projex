import {
  Badge,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';

import type {
  TxnReversalMatchComparison,
  TxnReversalMatchEvidence,
  TxnReversalTxnSummary,
} from '../../types';
import { formatCurrencyFromCents } from '../../utils/money';

function TransactionCard(props: {
  label: string;
  transaction: TxnReversalTxnSummary;
  currencyCode: string;
}) {
  const { label, transaction, currencyCode } = props;
  return (
    <Paper withBorder radius="md" p="md" h="100%">
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {label}
        </Text>
        <Text fw={650}>{transaction.item}</Text>
        <Text size="sm" c="dimmed">
          {transaction.description || 'No description provided'}
        </Text>
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="sm">{transaction.date}</Text>
          <Text
            size="sm"
            fw={650}
            c={transaction.amountCents < 0 ? 'red' : undefined}
          >
            {formatCurrencyFromCents(transaction.amountCents, currencyCode)}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}

function comparisonTone(comparison: TxnReversalMatchComparison | undefined): {
  color: string;
  label: string;
} {
  if (!comparison || comparison.outcome === 'not_applicable') {
    return { color: 'gray', label: 'Not available' };
  }
  if (comparison.outcome === 'match') {
    return { color: 'green', label: 'Matches' };
  }
  if (comparison.outcome === 'missing') {
    return { color: 'yellow', label: 'Missing data' };
  }
  return { color: 'red', label: 'Different' };
}

function EvidenceRow(props: {
  label: string;
  comparison?: TxnReversalMatchComparison;
  status?: {
    color: string;
    label: string;
  };
}) {
  const tone = props.status ?? comparisonTone(props.comparison);
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Text size="sm">{props.label}</Text>
      <Badge size="xs" color={tone.color} variant="light">
        {tone.label}
      </Badge>
    </Group>
  );
}

function formatDayDelta(dayDelta: number): string {
  if (dayDelta === 0) return 'Same date';
  const days = Math.abs(dayDelta);
  return `${days} day${days === 1 ? '' : 's'} ${
    dayDelta > 0 ? 'later' : 'earlier'
  }`;
}

function amountEvidenceLabel(
  evidence: TxnReversalMatchEvidence,
  counterpartAmountCents: number
): string {
  if (evidence.amountExact && evidence.oppositeSign) {
    return `Matching ${counterpartAmountCents < 0 ? 'negative' : 'positive'} amount`;
  }
  if (evidence.amountExact) return 'Exact amount, same sign';
  if (evidence.oppositeSign) return 'Opposite sign, different amount';
  return 'Amount differs';
}

export default function TransactionReversalPairDetails(props: {
  sourceTxn: TxnReversalTxnSummary;
  counterpartTxn: TxnReversalTxnSummary;
  evidence?: TxnReversalMatchEvidence;
  currencyCode: string;
  showAlternatives?: boolean;
}) {
  const {
    sourceTxn,
    counterpartTxn,
    evidence,
    currencyCode,
    showAlternatives = true,
  } = props;
  const metadataEvidence = evidence
    ? [
        { label: 'Source system', comparison: evidence.sourceSystem },
        {
          label: 'Journal description',
          comparison: evidence.journalDescription,
        },
        { label: 'Cost centre', comparison: evidence.costCentre },
        { label: 'Reference', comparison: evidence.reference },
      ]
    : [];
  const matchingEvidenceLabels = metadataEvidence.flatMap(
    ({ label, comparison }) => (comparison?.outcome === 'match' ? [label] : [])
  );
  const attentionEvidence = metadataEvidence.filter(
    ({ comparison }) => comparison?.outcome !== 'match'
  );

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TransactionCard
          label="Original transaction"
          transaction={sourceTxn}
          currencyCode={currencyCode}
        />
        <TransactionCard
          label="Reversal transaction"
          transaction={counterpartTxn}
          currencyCode={currencyCode}
        />
      </SimpleGrid>

      {evidence ? (
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Text size="sm" fw={650}>
              Match evidence
            </Text>
            <Divider />
            <EvidenceRow
              label="Amount"
              status={{
                color:
                  evidence.amountExact && evidence.oppositeSign
                    ? 'green'
                    : 'red',
                label: amountEvidenceLabel(
                  evidence,
                  counterpartTxn.amountCents
                ),
              }}
            />
            {matchingEvidenceLabels.length ? (
              <EvidenceRow
                label={matchingEvidenceLabels.join(' · ')}
                status={{
                  color: 'green',
                  label: 'Matching transaction data',
                }}
              />
            ) : null}
            {typeof evidence.dayDelta === 'number' ? (
              <EvidenceRow
                label="Timing"
                status={{
                  color: evidence.dayDelta >= 0 ? 'green' : 'red',
                  label: formatDayDelta(evidence.dayDelta),
                }}
              />
            ) : null}
            {attentionEvidence.map(({ label, comparison }) => (
              <EvidenceRow key={label} label={label} comparison={comparison} />
            ))}
          </Stack>
        </Paper>
      ) : null}

      {showAlternatives && evidence?.alternativeCounterparts?.length ? (
        <Paper withBorder radius="md" p="sm">
          <Stack gap={4}>
            <Text size="sm" fw={650}>
              Other valid candidates
            </Text>
            {evidence.alternativeCounterparts.map((candidate) => (
              <Text key={candidate.txnId} size="xs" c="dimmed">
                {candidate.date} ·{' '}
                {formatCurrencyFromCents(candidate.amountCents, currencyCode)} ·{' '}
                {candidate.item}
              </Text>
            ))}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
