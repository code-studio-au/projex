import type { Txn, TxnId } from '../../../types';

type PowerBiSourceMeta = Partial<Record<string, string>>;
type CanonicalPowerBiSourceMeta = Partial<
  Record<
    'source' | 'journalLineDescription' | 'ccAndDescription' | 'referenceNum',
    string
  >
>;

type ReversalAutoMatchEdge = {
  sourceTxn: Txn;
  counterpartTxn: Txn;
  score: number;
};

export type ReversalAutoMatchPlanEntry = ReversalAutoMatchEdge & {
  ambiguous: boolean;
  sourceCandidateTxnIds: TxnId[];
  counterpartCandidateTxnIds: TxnId[];
};

const MIN_AUTO_MATCH_SCORE = 125;

export function reversalAutoMatchPairKey(
  sourceTxnId: TxnId,
  counterpartTxnId: TxnId
) {
  return `${sourceTxnId}\u0000${counterpartTxnId}`;
}

const POWER_BI_META_KEY_ALIASES = {
  source: ['source', 'Source'],
  journalLineDescription: [
    'journalLineDescription',
    'Journal Line Description',
  ],
  ccAndDescription: ['ccAndDescription', 'CC and Description'],
  referenceNum: ['referenceNum', 'Reference Num'],
} as const;

function normalizeMetaValue(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toPowerBiSourceMeta(
  meta: Txn['importSourceMeta']
): CanonicalPowerBiSourceMeta | null {
  if (!meta) return null;
  const rawMeta = meta as PowerBiSourceMeta;

  return Object.fromEntries(
    Object.entries(POWER_BI_META_KEY_ALIASES).map(([canonicalKey, aliases]) => [
      canonicalKey,
      aliases
        .map((alias) => rawMeta[alias])
        .find((value) => typeof value === 'string' && value.trim()),
    ])
  ) as CanonicalPowerBiSourceMeta;
}

export function autoMatchScore(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): number {
  if (
    args.sourceTxn.importSourceType !== 'powerbi_expenditure_actuals' ||
    args.counterpartTxn.importSourceType !== 'powerbi_expenditure_actuals'
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceMeta = toPowerBiSourceMeta(args.sourceTxn.importSourceMeta);
  const counterpartMeta = toPowerBiSourceMeta(
    args.counterpartTxn.importSourceMeta
  );
  if (!sourceMeta || !counterpartMeta) return Number.NEGATIVE_INFINITY;

  const sourceType = normalizeMetaValue(sourceMeta.source);
  const counterpartType = normalizeMetaValue(counterpartMeta.source);
  if (!sourceType || sourceType !== counterpartType) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceJournalLineDescription = normalizeMetaValue(
    sourceMeta.journalLineDescription
  );
  const counterpartJournalLineDescription = normalizeMetaValue(
    counterpartMeta.journalLineDescription
  );
  if (
    !sourceJournalLineDescription ||
    sourceJournalLineDescription !== counterpartJournalLineDescription
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceReferenceNum = normalizeMetaValue(sourceMeta.referenceNum);
  const counterpartReferenceNum = normalizeMetaValue(
    counterpartMeta.referenceNum
  );
  if (
    sourceReferenceNum &&
    counterpartReferenceNum &&
    sourceReferenceNum !== counterpartReferenceNum
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceCostCentre = normalizeMetaValue(sourceMeta.ccAndDescription);
  const counterpartCostCentre = normalizeMetaValue(
    counterpartMeta.ccAndDescription
  );
  if (
    sourceCostCentre &&
    counterpartCostCentre &&
    sourceCostCentre !== counterpartCostCentre
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const dayDelta = Math.round(
    (Date.parse(args.counterpartTxn.date) - Date.parse(args.sourceTxn.date)) /
      (24 * 60 * 60 * 1000)
  );
  if (!Number.isFinite(dayDelta) || dayDelta < 0 || dayDelta > 62) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 100;
  if (sourceReferenceNum && counterpartReferenceNum) score += 100;
  if (sourceCostCentre && counterpartCostCentre) score += 25;
  if (dayDelta <= 31) score += 25;
  return score;
}

export function isValidReversalAutoMatchEdge(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}) {
  return (
    args.sourceTxn.amountCents > 0 &&
    args.counterpartTxn.amountCents < 0 &&
    args.sourceTxn.amountCents === Math.abs(args.counterpartTxn.amountCents) &&
    autoMatchScore(args) >= MIN_AUTO_MATCH_SCORE
  );
}

function compareTxns(a: Txn, b: Txn) {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function compareSourceEdges(
  a: ReversalAutoMatchEdge,
  b: ReversalAutoMatchEdge
) {
  const aDayDelta =
    Date.parse(a.counterpartTxn.date) - Date.parse(a.sourceTxn.date);
  const bDayDelta =
    Date.parse(b.counterpartTxn.date) - Date.parse(b.sourceTxn.date);
  return (
    b.score - a.score ||
    aDayDelta - bDayDelta ||
    compareTxns(a.counterpartTxn, b.counterpartTxn)
  );
}

function highestScore(edges: ReversalAutoMatchEdge[]) {
  return edges.reduce(
    (highest, edge) => Math.max(highest, edge.score),
    Number.NEGATIVE_INFINITY
  );
}

export function buildReversalAutoMatchPlan(args: {
  sourceTxns: Txn[];
  counterpartTxns: Txn[];
  excludedPairKeys?: ReadonlySet<string>;
}): ReversalAutoMatchPlanEntry[] {
  const edges = args.sourceTxns.flatMap((sourceTxn) =>
    args.counterpartTxns.flatMap((counterpartTxn) => {
      if (
        args.excludedPairKeys?.has(
          reversalAutoMatchPairKey(sourceTxn.id, counterpartTxn.id)
        )
      ) {
        return [];
      }
      if (
        sourceTxn.amountCents <= 0 ||
        counterpartTxn.amountCents >= 0 ||
        sourceTxn.amountCents !== Math.abs(counterpartTxn.amountCents)
      ) {
        return [];
      }
      const score = autoMatchScore({ sourceTxn, counterpartTxn });
      if (score < MIN_AUTO_MATCH_SCORE) return [];
      return [
        {
          sourceTxn,
          counterpartTxn,
          score,
        },
      ];
    })
  );
  if (!edges.length) return [];

  const edgesBySourceId = new Map<TxnId, ReversalAutoMatchEdge[]>();
  const edgesByCounterpartId = new Map<TxnId, ReversalAutoMatchEdge[]>();
  for (const edge of edges) {
    const sourceEdges = edgesBySourceId.get(edge.sourceTxn.id) ?? [];
    sourceEdges.push(edge);
    edgesBySourceId.set(edge.sourceTxn.id, sourceEdges);

    const counterpartEdges =
      edgesByCounterpartId.get(edge.counterpartTxn.id) ?? [];
    counterpartEdges.push(edge);
    edgesByCounterpartId.set(edge.counterpartTxn.id, counterpartEdges);
  }
  for (const sourceEdges of edgesBySourceId.values()) {
    sourceEdges.sort(compareSourceEdges);
  }

  // Deterministic augmenting paths retain as many valid pairs as possible.
  const matchedSourceByCounterpartId = new Map<TxnId, TxnId>();
  const tryAssignSource = (
    sourceTxnId: TxnId,
    visitedSourceIds: Set<TxnId>,
    visitedCounterpartIds: Set<TxnId>
  ): boolean => {
    if (visitedSourceIds.has(sourceTxnId)) return false;
    visitedSourceIds.add(sourceTxnId);

    const sourceEdges = edgesBySourceId.get(sourceTxnId) ?? [];
    for (const edge of sourceEdges) {
      const counterpartTxnId = edge.counterpartTxn.id;
      if (visitedCounterpartIds.has(counterpartTxnId)) continue;
      if (!matchedSourceByCounterpartId.has(counterpartTxnId)) {
        visitedCounterpartIds.add(counterpartTxnId);
        matchedSourceByCounterpartId.set(counterpartTxnId, sourceTxnId);
        return true;
      }
    }

    for (const edge of sourceEdges) {
      const counterpartTxnId = edge.counterpartTxn.id;
      if (visitedCounterpartIds.has(counterpartTxnId)) continue;
      visitedCounterpartIds.add(counterpartTxnId);

      const currentSourceTxnId =
        matchedSourceByCounterpartId.get(counterpartTxnId);
      if (
        currentSourceTxnId &&
        tryAssignSource(
          currentSourceTxnId,
          visitedSourceIds,
          visitedCounterpartIds
        )
      ) {
        matchedSourceByCounterpartId.set(counterpartTxnId, sourceTxnId);
        return true;
      }
    }
    return false;
  };

  for (const sourceTxn of [...args.sourceTxns].sort(compareTxns)) {
    tryAssignSource(sourceTxn.id, new Set(), new Set());
  }

  const matchedEdgeBySourceId = new Map<TxnId, ReversalAutoMatchEdge>();
  for (const [counterpartTxnId, sourceTxnId] of matchedSourceByCounterpartId) {
    const edge = edgesBySourceId
      .get(sourceTxnId)
      ?.find((candidate) => candidate.counterpartTxn.id === counterpartTxnId);
    if (edge) matchedEdgeBySourceId.set(sourceTxnId, edge);
  }

  const ambiguousSourceIds = new Set<TxnId>();
  const visitedSourceIds = new Set<TxnId>();
  for (const rootSourceTxnId of edgesBySourceId.keys()) {
    if (visitedSourceIds.has(rootSourceTxnId)) continue;

    const componentSourceIds = new Set<TxnId>();
    const componentCounterpartIds = new Set<TxnId>();
    const pendingSourceIds = [rootSourceTxnId];
    while (pendingSourceIds.length) {
      const sourceTxnId = pendingSourceIds.pop();
      if (!sourceTxnId || componentSourceIds.has(sourceTxnId)) continue;
      componentSourceIds.add(sourceTxnId);
      visitedSourceIds.add(sourceTxnId);

      for (const edge of edgesBySourceId.get(sourceTxnId) ?? []) {
        if (componentCounterpartIds.has(edge.counterpartTxn.id)) continue;
        componentCounterpartIds.add(edge.counterpartTxn.id);
        for (const counterpartEdge of edgesByCounterpartId.get(
          edge.counterpartTxn.id
        ) ?? []) {
          pendingSourceIds.push(counterpartEdge.sourceTxn.id);
        }
      }
    }

    const hasTopScoreTie =
      [...componentSourceIds].some((sourceTxnId) => {
        const sourceEdges = edgesBySourceId.get(sourceTxnId) ?? [];
        const topScore = highestScore(sourceEdges);
        return sourceEdges.filter((edge) => edge.score === topScore).length > 1;
      }) ||
      [...componentCounterpartIds].some((counterpartTxnId) => {
        const counterpartEdges =
          edgesByCounterpartId.get(counterpartTxnId) ?? [];
        const topScore = highestScore(counterpartEdges);
        return (
          counterpartEdges.filter((edge) => edge.score === topScore).length > 1
        );
      });
    const selectedNonTopEdge = [...componentSourceIds].some((sourceTxnId) => {
      const selectedEdge = matchedEdgeBySourceId.get(sourceTxnId);
      if (!selectedEdge) return false;
      return (
        selectedEdge.score <
          highestScore(edgesBySourceId.get(sourceTxnId) ?? []) ||
        selectedEdge.score <
          highestScore(
            edgesByCounterpartId.get(selectedEdge.counterpartTxn.id) ?? []
          )
      );
    });

    if (hasTopScoreTie || selectedNonTopEdge) {
      componentSourceIds.forEach((sourceTxnId) =>
        ambiguousSourceIds.add(sourceTxnId)
      );
    }
  }

  return [...matchedEdgeBySourceId.values()]
    .sort((a, b) => compareTxns(a.sourceTxn, b.sourceTxn))
    .map((edge) => ({
      ...edge,
      ambiguous: ambiguousSourceIds.has(edge.sourceTxn.id),
      sourceCandidateTxnIds: (edgesBySourceId.get(edge.sourceTxn.id) ?? []).map(
        (candidate) => candidate.counterpartTxn.id
      ),
      counterpartCandidateTxnIds: (
        edgesByCounterpartId.get(edge.counterpartTxn.id) ?? []
      )
        .map((candidate) => candidate.sourceTxn)
        .sort(compareTxns)
        .map((txn) => txn.id),
    }));
}
