import type { Txn, TxnId } from '../../../types';
import {
  normalizeReversalMatchValue,
  reversalDayDelta,
  toReversalMatchFacts,
} from './reversalMatchFacts';

type ReversalAutoMatchEdge = {
  sourceTxn: Txn;
  counterpartTxn: Txn;
  score: number;
};

export type ReversalAutoMatchPlanEntry = ReversalAutoMatchEdge & {
  ambiguous: boolean;
  sourceCandidateTxnIds: TxnId[];
  counterpartCandidateTxnIds: TxnId[];
  validCounterpartTxns: Txn[];
  validSourceTxns: Txn[];
};

const MIN_AUTO_MATCH_SCORE = 125;

export function reversalAutoMatchPairKey(
  sourceTxnId: TxnId,
  counterpartTxnId: TxnId
) {
  return `${sourceTxnId}\u0000${counterpartTxnId}`;
}

export function autoMatchScore(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): number {
  const sourceFacts = toReversalMatchFacts(args.sourceTxn);
  const counterpartFacts = toReversalMatchFacts(args.counterpartTxn);
  const sourceType = normalizeReversalMatchValue(sourceFacts.sourceType);
  const counterpartType = normalizeReversalMatchValue(
    counterpartFacts.sourceType
  );
  if (sourceType && counterpartType && sourceType !== counterpartType) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceSystem = normalizeReversalMatchValue(sourceFacts.sourceSystem);
  const counterpartSystem = normalizeReversalMatchValue(
    counterpartFacts.sourceSystem
  );
  if (!sourceSystem || sourceSystem !== counterpartSystem) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceJournalDescription = normalizeReversalMatchValue(
    sourceFacts.journalDescription
  );
  const counterpartJournalDescription = normalizeReversalMatchValue(
    counterpartFacts.journalDescription
  );
  if (
    !sourceJournalDescription ||
    sourceJournalDescription !== counterpartJournalDescription
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceReference = normalizeReversalMatchValue(sourceFacts.reference);
  const counterpartReference = normalizeReversalMatchValue(
    counterpartFacts.reference
  );
  if (
    sourceReference &&
    counterpartReference &&
    sourceReference !== counterpartReference
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceCostCentre = normalizeReversalMatchValue(sourceFacts.costCentre);
  const counterpartCostCentre = normalizeReversalMatchValue(
    counterpartFacts.costCentre
  );
  if (
    sourceCostCentre &&
    counterpartCostCentre &&
    sourceCostCentre !== counterpartCostCentre
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const dayDelta = reversalDayDelta(args);
  if (!Number.isFinite(dayDelta) || dayDelta < 0 || dayDelta > 62) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 100;
  if (sourceReference && counterpartReference) score += 100;
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

    const hasMultipleCandidates =
      [...componentSourceIds].some(
        (sourceTxnId) => (edgesBySourceId.get(sourceTxnId) ?? []).length > 1
      ) ||
      [...componentCounterpartIds].some(
        (counterpartTxnId) =>
          (edgesByCounterpartId.get(counterpartTxnId) ?? []).length > 1
      );
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

    if (hasMultipleCandidates || selectedNonTopEdge) {
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
      validCounterpartTxns: (edgesBySourceId.get(edge.sourceTxn.id) ?? [])
        .map((candidate) => candidate.counterpartTxn)
        .sort(compareTxns),
      validSourceTxns: (edgesByCounterpartId.get(edge.counterpartTxn.id) ?? [])
        .map((candidate) => candidate.sourceTxn)
        .sort(compareTxns),
    }));
}
