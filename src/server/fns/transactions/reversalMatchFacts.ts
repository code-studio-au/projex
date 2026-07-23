import type {
  Txn,
  TxnReversalMatchComparison,
  TxnReversalMatchEvidence,
  TxnReversalTxnSummary,
} from '../../../types';

type SourceMeta = Record<string, string>;

const MATCH_META_ALIASES = {
  sourceSystem: [
    'sourceSystem',
    'Source System',
    'source',
    'Source',
    'system',
    'System',
  ],
  journalDescription: [
    'journalLineDescription',
    'Journal Line Description',
    'journalDescription',
    'Journal Description',
    'description',
    'Description',
  ],
  reference: [
    'referenceNum',
    'Reference Num',
    'reference',
    'Reference',
    'transactionReference',
    'Transaction Reference',
  ],
  costCentre: [
    'ccAndDescription',
    'CC and Description',
    'costCentre',
    'Cost Centre',
    'costCenter',
    'Cost Center',
  ],
} as const;

export type ReversalMatchFacts = {
  sourceType?: string;
  sourceSystem?: string;
  journalDescription?: string;
  reference?: string;
  costCentre?: string;
};

function firstMetaValue(
  meta: SourceMeta | undefined,
  aliases: readonly string[]
) {
  if (!meta) return undefined;
  return aliases
    .map((alias) => meta[alias])
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim();
}

export function normalizeReversalMatchValue(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function toReversalMatchFacts(txn: Txn): ReversalMatchFacts {
  const meta = txn.importSourceMeta as SourceMeta | undefined;
  return {
    sourceType: txn.importSourceType,
    sourceSystem:
      firstMetaValue(meta, MATCH_META_ALIASES.sourceSystem) ??
      txn.importSourceType,
    journalDescription: firstMetaValue(
      meta,
      MATCH_META_ALIASES.journalDescription
    ),
    reference: firstMetaValue(meta, MATCH_META_ALIASES.reference),
    costCentre: firstMetaValue(meta, MATCH_META_ALIASES.costCentre),
  };
}

export function toTxnReversalTxnSummary(txn: Txn): TxnReversalTxnSummary {
  const facts = toReversalMatchFacts(txn);
  return {
    txnId: txn.id,
    externalId: txn.externalId,
    date: txn.date,
    item: txn.item,
    description: txn.description,
    amountCents: txn.amountCents,
    sourceType: facts.sourceType,
    sourceSystem: facts.sourceSystem,
    journalDescription: facts.journalDescription,
    reference: facts.reference,
    costCentre: facts.costCentre,
  };
}

export function reversalDayDelta(args: {
  sourceTxn: Pick<Txn, 'date'>;
  counterpartTxn: Pick<Txn, 'date'>;
}) {
  return Math.round(
    (Date.parse(args.counterpartTxn.date) - Date.parse(args.sourceTxn.date)) /
      (24 * 60 * 60 * 1000)
  );
}

function comparison(
  sourceValue: string | undefined,
  counterpartValue: string | undefined,
  options: { required?: boolean } = {}
): TxnReversalMatchComparison {
  const normalizedSource = normalizeReversalMatchValue(sourceValue);
  const normalizedCounterpart = normalizeReversalMatchValue(counterpartValue);
  if (!normalizedSource || !normalizedCounterpart) {
    return {
      sourceValue,
      counterpartValue,
      outcome: options.required ? 'missing' : 'not_applicable',
    };
  }
  return {
    sourceValue,
    counterpartValue,
    outcome: normalizedSource === normalizedCounterpart ? 'match' : 'mismatch',
  };
}

export function buildReversalMatchEvidence(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
  sourceCandidateCount?: number;
  counterpartCandidateCount?: number;
  alternativeCounterparts?: Txn[];
}): TxnReversalMatchEvidence {
  const sourceFacts = toReversalMatchFacts(args.sourceTxn);
  const counterpartFacts = toReversalMatchFacts(args.counterpartTxn);
  const dayDelta = reversalDayDelta(args);
  const amountExact =
    args.sourceTxn.amountCents === Math.abs(args.counterpartTxn.amountCents);
  const oppositeSign =
    args.sourceTxn.amountCents > 0 && args.counterpartTxn.amountCents < 0;
  const sourceSystem = comparison(
    sourceFacts.sourceSystem,
    counterpartFacts.sourceSystem,
    { required: true }
  );
  const journalDescription = comparison(
    sourceFacts.journalDescription,
    counterpartFacts.journalDescription,
    { required: true }
  );
  const reference = comparison(
    sourceFacts.reference,
    counterpartFacts.reference
  );
  const costCentre = comparison(
    sourceFacts.costCentre,
    counterpartFacts.costCentre
  );
  const reasons = [
    amountExact ? 'Exact opposite amount' : 'Amounts do not offset',
    Number.isFinite(dayDelta)
      ? dayDelta === 0
        ? 'Same transaction date'
        : `${Math.abs(dayDelta)} day${Math.abs(dayDelta) === 1 ? '' : 's'} ${
            dayDelta > 0 ? 'later' : 'earlier'
          }`
      : 'Transaction date could not be compared',
    sourceSystem.outcome === 'match'
      ? 'Same source system'
      : 'Source system is not an exact match',
    journalDescription.outcome === 'match'
      ? 'Same journal description'
      : 'Journal description is not an exact match',
    ...(reference.outcome === 'match' ? ['Same reference'] : []),
    ...(costCentre.outcome === 'match' ? ['Same cost centre'] : []),
  ];

  return {
    amountExact,
    oppositeSign,
    dayDelta: Number.isFinite(dayDelta) ? dayDelta : undefined,
    withinAutoWindow:
      Number.isFinite(dayDelta) && dayDelta >= 0 && dayDelta <= 62,
    sourceSystem,
    journalDescription,
    reference,
    costCentre,
    sourceCandidateCount: args.sourceCandidateCount,
    counterpartCandidateCount: args.counterpartCandidateCount,
    alternativeCounterparts: (args.alternativeCounterparts ?? [])
      .slice(0, 10)
      .map(toTxnReversalTxnSummary),
    reasons,
  };
}
