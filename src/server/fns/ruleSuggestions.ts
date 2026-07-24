import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
  RuleSuggestionsListResult,
} from '../../api/types';
import type {
  CompanyDefaultMappingRuleId,
  RuleSuggestionAcceptanceAction,
  RuleSuggestionType,
  Txn,
} from '../../types';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asRuleSuggestionSignalId,
  asRuleSuggestionId,
  asSubCategoryId,
  type CompanyId,
  type ProjectId,
  type UserId,
} from '../../types';
import { uid } from '../../utils/id';
import { subCategoryNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import {
  buildRuleSuggestionMatchTextOptions,
  calculateRuleSuggestionConfidence,
  deriveRuleSuggestionPattern,
  didManualCodingTargetChange,
  normalizeRuleSuggestionPatternText,
  ruleSuggestionConfidenceLevel,
  ruleSuggestionConfidenceReasons,
} from '../../utils/ruleSuggestions';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { syncCompanyAutoCodingRulesToSyncedProjects } from './projectAutoCodingRules';

const MIN_RULE_SUGGESTION_SAMPLE_COUNT = 3;
const DISMISSAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DISMISSAL_REOPEN_SAMPLE_DELTA = 3;

type SuggestionKey = {
  companyId: CompanyId;
  suggestionType: RuleSuggestionType;
  sourceRuleId: CompanyDefaultMappingRuleId | null;
  patternTextNormalized: string;
  companyDefaultSubCategoryId: ReturnType<typeof asCompanyDefaultSubCategoryId>;
};

type ExistingSignalRow = {
  id: string;
  company_id: string;
  suggestion_type: RuleSuggestionType;
  source_rule_id: string | null;
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
};

function buildSuggestionKey(row: {
  company_id: string;
  suggestion_type: RuleSuggestionType;
  source_rule_id: string | null;
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
}): SuggestionKey {
  return {
    companyId: row.company_id as CompanyId,
    suggestionType: row.suggestion_type,
    sourceRuleId: row.source_rule_id
      ? asCompanyDefaultMappingRuleId(row.source_rule_id)
      : null,
    patternTextNormalized: row.pattern_text_normalized,
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
      row.company_default_sub_category_id
    ),
  };
}

function suggestionKeysEqual(a: SuggestionKey, b: SuggestionKey): boolean {
  return (
    a.companyId === b.companyId &&
    a.suggestionType === b.suggestionType &&
    a.sourceRuleId === b.sourceRuleId &&
    a.patternTextNormalized === b.patternTextNormalized &&
    a.companyDefaultSubCategoryId === b.companyDefaultSubCategoryId
  );
}

async function resolveCompanyDefaultTarget(args: {
  db: Kysely<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId: NonNullable<Txn['categoryId']>;
  subCategoryId: NonNullable<Txn['subCategoryId']>;
}) {
  const [
    projectCategory,
    projectSubCategory,
    defaultCategories,
    defaultSubCategories,
  ] = await Promise.all([
    args.db
      .selectFrom('categories')
      .select(['id', 'name', 'origin_company_item_id'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.categoryId)
      .executeTakeFirst(),
    args.db
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'name', 'origin_company_item_id'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.subCategoryId)
      .executeTakeFirst(),
    args.db
      .selectFrom('company_default_categories')
      .select(['id', 'name'])
      .where('company_id', '=', args.companyId)
      .execute(),
    args.db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'company_default_category_id', 'name'])
      .where('company_id', '=', args.companyId)
      .execute(),
  ]);

  if (
    !projectCategory ||
    !projectSubCategory ||
    projectSubCategory.category_id !== projectCategory.id
  ) {
    return null;
  }

  const inheritedDefaultSubCategory = projectSubCategory.origin_company_item_id
    ? defaultSubCategories.find(
        (row) => row.id === projectSubCategory.origin_company_item_id
      )
    : null;
  if (inheritedDefaultSubCategory) {
    return {
      projectCategoryId: asCategoryId(projectCategory.id),
      projectSubCategoryId: args.subCategoryId,
      companyDefaultCategoryId: asCompanyDefaultCategoryId(
        inheritedDefaultSubCategory.company_default_category_id
      ),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
        inheritedDefaultSubCategory.id
      ),
    };
  }

  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, ' ');
  const projectCategoryName = normalize(projectCategory.name);
  const projectSubCategoryName = normalize(projectSubCategory.name);

  const defaultCategory =
    (projectCategory.origin_company_item_id
      ? defaultCategories.find(
          (row) => row.id === projectCategory.origin_company_item_id
        )
      : null) ??
    defaultCategories.find(
      (row) => normalize(row.name) === projectCategoryName
    );
  if (!defaultCategory) return null;

  const defaultSubCategory = defaultSubCategories.find(
    (row) =>
      row.company_default_category_id === defaultCategory.id &&
      normalize(row.name) === projectSubCategoryName
  );
  if (!defaultSubCategory) return null;

  return {
    projectCategoryId: asCategoryId(projectCategory.id),
    projectSubCategoryId: args.subCategoryId,
    companyDefaultCategoryId: asCompanyDefaultCategoryId(defaultCategory.id),
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
      defaultSubCategory.id
    ),
  };
}

async function refreshSuggestionAggregate(
  db: Kysely<DB>,
  key: SuggestionKey
): Promise<void> {
  const signals = await db
    .selectFrom('rule_suggestion_signals as sig')
    .innerJoin('txns as t', (join) =>
      join
        .onRef('sig.project_id', '=', 't.project_id')
        .onRef('sig.txn_public_id', '=', 't.public_id')
    )
    .select([
      'sig.id',
      'sig.company_id',
      'sig.project_id',
      'sig.source_rule_id',
      'sig.pattern_basis',
      'sig.pattern_text_raw',
      'sig.pattern_text_normalized',
      'sig.project_category_id',
      'sig.project_sub_category_id',
      'sig.company_default_category_id',
      'sig.company_default_sub_category_id',
      'sig.created_at',
      'sig.updated_at',
      't.txn_date',
    ])
    .where('sig.company_id', '=', key.companyId)
    .where('sig.suggestion_type', '=', key.suggestionType)
    .where('sig.pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'sig.company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .where(({ eb }) =>
      key.sourceRuleId
        ? eb('sig.source_rule_id', '=', key.sourceRuleId)
        : eb('sig.source_rule_id', 'is', null)
    )
    .orderBy('sig.created_at', 'asc')
    .execute();

  if (signals.length === 0) {
    await db
      .deleteFrom('rule_suggestions')
      .where('company_id', '=', key.companyId)
      .where('suggestion_type', '=', key.suggestionType)
      .where('pattern_text_normalized', '=', key.patternTextNormalized)
      .where(
        'company_default_sub_category_id',
        '=',
        key.companyDefaultSubCategoryId
      )
      .where(({ eb }) =>
        key.sourceRuleId
          ? eb('source_rule_id', '=', key.sourceRuleId)
          : eb('source_rule_id', 'is', null)
      )
      .where('status', '=', 'open')
      .execute();
    return;
  }

  const sampleCount = signals.length;
  const firstSignal = signals[0]!;
  const lastSignal = signals[signals.length - 1]!;
  const now = new Date().toISOString();
  const distinctTxnDateCount = new Set(signals.map((signal) => signal.txn_date))
    .size;
  const distinctProjectCount = new Set(
    signals.map((signal) => signal.project_id)
  ).size;
  const patternBasis = firstSignal.pattern_basis;
  const confidenceScore = calculateRuleSuggestionConfidence({
    sampleCount,
    distinctTxnDateCount,
    distinctProjectCount,
    patternBasis,
  });
  const matchTextOptions = buildRuleSuggestionMatchTextOptions({
    normalizedPattern: key.patternTextNormalized,
    rawPatterns: signals.map((signal) => signal.pattern_text_raw),
  });
  const sourceRule = key.sourceRuleId
    ? await db
        .selectFrom('company_default_mapping_rules')
        .select(['id', 'match_text'])
        .where('company_id', '=', key.companyId)
        .where('id', '=', key.sourceRuleId)
        .executeTakeFirst()
    : null;
  const recommendedAction: RuleSuggestionAcceptanceAction =
    key.suggestionType === 'create_rule'
      ? 'create_rule'
      : sourceRule &&
          normalizeRuleSuggestionPatternText(sourceRule.match_text) ===
            key.patternTextNormalized
        ? 'update_existing'
        : 'create_narrower';

  const existing = await db
    .selectFrom('rule_suggestions')
    .select(['id', 'status', 'dismissed_at', 'dismissed_sample_count'])
    .where('company_id', '=', key.companyId)
    .where('suggestion_type', '=', key.suggestionType)
    .where('pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .where(({ eb }) =>
      key.sourceRuleId
        ? eb('source_rule_id', '=', key.sourceRuleId)
        : eb('source_rule_id', 'is', null)
    )
    .executeTakeFirst();

  const dismissalAgeMs = existing?.dismissed_at
    ? Date.now() - Date.parse(existing.dismissed_at)
    : Number.POSITIVE_INFINITY;
  const shouldRemainDismissed =
    existing?.status === 'dismissed' &&
    dismissalAgeMs < DISMISSAL_COOLDOWN_MS &&
    sampleCount <
      Number(existing.dismissed_sample_count ?? 0) +
        DISMISSAL_REOPEN_SAMPLE_DELTA;

  const nextValues = {
    source_rule_id: key.sourceRuleId,
    pattern_basis: patternBasis,
    proposed_match_text: matchTextOptions.proposedMatchText,
    match_text_alternatives: matchTextOptions.alternatives,
    project_category_id: firstSignal.project_category_id,
    project_sub_category_id: firstSignal.project_sub_category_id,
    company_default_category_id: firstSignal.company_default_category_id,
    company_default_sub_category_id:
      firstSignal.company_default_sub_category_id,
    sample_count: sampleCount,
    distinct_txn_date_count: distinctTxnDateCount,
    distinct_project_count: distinctProjectCount,
    confidence_score: confidenceScore,
    recommended_action: recommendedAction,
    first_seen_at: firstSignal.created_at,
    last_seen_at: lastSignal.updated_at,
    updated_at: now,
  };
  const reopenedValues = {
    ...nextValues,
    status: 'open' as const,
    accepted_rule_id: null,
    accepted_action: null,
    accepted_at: null,
    accepted_by_user_id: null,
    dismissed_reason: null,
    dismissed_sample_count: null,
    dismissed_at: null,
    dismissed_by_user_id: null,
  };

  if (existing) {
    await db
      .updateTable('rule_suggestions')
      .set(shouldRemainDismissed ? nextValues : reopenedValues)
      .where('id', '=', existing.id)
      .execute();
    return;
  }

  await db
    .insertInto('rule_suggestions')
    .values({
      id: uid('rsug'),
      company_id: key.companyId,
      status: 'open',
      suggestion_type: key.suggestionType,
      source_rule_id: key.sourceRuleId,
      pattern_basis: patternBasis,
      pattern_text_normalized: key.patternTextNormalized,
      proposed_match_text: matchTextOptions.proposedMatchText,
      match_text_alternatives: matchTextOptions.alternatives,
      project_category_id: firstSignal.project_category_id,
      project_sub_category_id: firstSignal.project_sub_category_id,
      company_default_category_id: firstSignal.company_default_category_id,
      company_default_sub_category_id:
        firstSignal.company_default_sub_category_id,
      sample_count: sampleCount,
      distinct_txn_date_count: distinctTxnDateCount,
      distinct_project_count: distinctProjectCount,
      confidence_score: confidenceScore,
      recommended_action: recommendedAction,
      first_seen_at: firstSignal.created_at,
      last_seen_at: lastSignal.updated_at,
      accepted_rule_id: null,
      accepted_action: null,
      accepted_at: null,
      accepted_by_user_id: null,
      dismissed_reason: null,
      dismissed_sample_count: null,
      dismissed_at: null,
      dismissed_by_user_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

export async function recordManualRuleSuggestionSignal(args: {
  db?: Kysely<DB>;
  userId: UserId;
  prev: Txn;
  next: Txn;
}): Promise<void> {
  const db = args.db ?? getDb();

  const existingSignal = (await db
    .selectFrom('rule_suggestion_signals')
    .select([
      'id',
      'company_id',
      'suggestion_type',
      'source_rule_id',
      'pattern_text_normalized',
      'company_default_sub_category_id',
    ])
    .where('txn_public_id', '=', args.next.id)
    .executeTakeFirst()) as ExistingSignalRow | undefined;

  const prevKey = existingSignal ? buildSuggestionKey(existingSignal) : null;

  const shouldCreateSignal =
    args.next.codingSource === 'manual' &&
    args.next.categorisable &&
    Boolean(args.next.categoryId) &&
    Boolean(args.next.subCategoryId) &&
    didManualCodingTargetChange(args.prev, args.next);

  if (!shouldCreateSignal) {
    if (existingSignal) {
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .execute();
      await refreshSuggestionAggregate(db, prevKey!);
    }
    return;
  }

  const pattern = deriveRuleSuggestionPattern(args.next);
  if (!pattern || !args.next.categoryId || !args.next.subCategoryId) {
    if (existingSignal) {
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .execute();
      await refreshSuggestionAggregate(db, prevKey!);
    }
    return;
  }

  const resolvedTarget = await resolveCompanyDefaultTarget({
    db,
    companyId: args.next.companyId,
    projectId: args.next.projectId,
    categoryId: args.next.categoryId,
    subCategoryId: args.next.subCategoryId,
  });
  if (!resolvedTarget) {
    if (existingSignal) {
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .execute();
      await refreshSuggestionAggregate(db, prevKey!);
    }
    return;
  }

  const priorRuleId =
    args.prev.codingSource === 'company_default_rule'
      ? args.prev.companyDefaultMappingRuleId
      : undefined;
  const priorRule = priorRuleId
    ? await db
        .selectFrom('company_default_mapping_rules')
        .select('id')
        .where('company_id', '=', args.next.companyId)
        .where('id', '=', priorRuleId)
        .executeTakeFirst()
    : null;
  const suggestionType: RuleSuggestionType = priorRule
    ? 'update_rule'
    : 'create_rule';
  const sourceRuleId = priorRule
    ? asCompanyDefaultMappingRuleId(priorRule.id)
    : null;
  const now = new Date().toISOString();
  const nextKey: SuggestionKey = {
    companyId: args.next.companyId,
    suggestionType,
    sourceRuleId,
    patternTextNormalized: pattern.normalized,
    companyDefaultSubCategoryId: resolvedTarget.companyDefaultSubCategoryId,
  };

  if (existingSignal) {
    await db
      .updateTable('rule_suggestion_signals')
      .set({
        company_id: args.next.companyId,
        project_id: args.next.projectId,
        txn_public_id: args.next.id,
        suggestion_type: suggestionType,
        source_rule_id: sourceRuleId,
        pattern_basis: pattern.basis,
        pattern_text_raw: pattern.raw,
        pattern_text_normalized: pattern.normalized,
        project_category_id: resolvedTarget.projectCategoryId,
        project_sub_category_id: resolvedTarget.projectSubCategoryId,
        company_default_category_id: resolvedTarget.companyDefaultCategoryId,
        company_default_sub_category_id:
          resolvedTarget.companyDefaultSubCategoryId,
        acted_by_user_id: args.userId,
        updated_at: now,
      })
      .where('id', '=', existingSignal.id)
      .execute();
  } else {
    await db
      .insertInto('rule_suggestion_signals')
      .values({
        id: asRuleSuggestionSignalId(uid('rsig')),
        company_id: args.next.companyId,
        project_id: args.next.projectId,
        txn_public_id: args.next.id,
        suggestion_type: suggestionType,
        source_rule_id: sourceRuleId,
        pattern_basis: pattern.basis,
        pattern_text_raw: pattern.raw,
        pattern_text_normalized: pattern.normalized,
        project_category_id: resolvedTarget.projectCategoryId,
        project_sub_category_id: resolvedTarget.projectSubCategoryId,
        company_default_category_id: resolvedTarget.companyDefaultCategoryId,
        company_default_sub_category_id:
          resolvedTarget.companyDefaultSubCategoryId,
        acted_by_user_id: args.userId,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  if (prevKey && !suggestionKeysEqual(prevKey, nextKey)) {
    await refreshSuggestionAggregate(db, prevKey);
  }
  await refreshSuggestionAggregate(db, nextKey);
}

async function requireCompanyViewContext(
  context: ServerFnContextInput,
  companyId: CompanyId
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  await requireAuthorized({ db, userId, action: 'company:view', companyId });
  return { db, userId };
}

async function requireCompanyManageDefaultsContext(
  context: ServerFnContextInput,
  companyId: CompanyId
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  await requireAuthorized({
    db,
    userId,
    action: 'company:manage_defaults',
    companyId,
  });
  return { db, userId };
}

export async function listRuleSuggestionsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<RuleSuggestionsListResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireCompanyViewContext(
      args.context,
      args.companyId
    );

    const suggestions = await db
      .selectFrom('rule_suggestions')
      .selectAll()
      .where('company_id', '=', args.companyId)
      .where('status', '=', 'open')
      .where('sample_count', '>=', MIN_RULE_SUGGESTION_SAMPLE_COUNT)
      .orderBy('last_seen_at', 'desc')
      .orderBy('sample_count', 'desc')
      .execute();

    if (suggestions.length === 0) return [];

    const evidenceRows = await db
      .selectFrom('rule_suggestions as rs')
      .innerJoin('rule_suggestion_signals as sig', (join) =>
        join
          .onRef('rs.company_id', '=', 'sig.company_id')
          .onRef('rs.suggestion_type', '=', 'sig.suggestion_type')
          .onRef(
            'rs.pattern_text_normalized',
            '=',
            'sig.pattern_text_normalized'
          )
          .onRef(
            'rs.company_default_sub_category_id',
            '=',
            'sig.company_default_sub_category_id'
          )
          .on((eb) =>
            eb.or([
              eb('rs.source_rule_id', '=', eb.ref('sig.source_rule_id')),
              eb.and([
                eb('rs.source_rule_id', 'is', null),
                eb('sig.source_rule_id', 'is', null),
              ]),
            ])
          )
      )
      .innerJoin('txns as t', (join) =>
        join
          .onRef('sig.project_id', '=', 't.project_id')
          .onRef('sig.txn_public_id', '=', 't.public_id')
      )
      .innerJoin('projects as p', 'p.id', 'sig.project_id')
      .select([
        'rs.id as suggestion_id',
        'sig.txn_public_id',
        'sig.project_id',
        'p.name as project_name',
        'p.currency',
        't.item',
        't.description',
        't.amount_cents',
        't.txn_date',
        'sig.created_at',
      ])
      .where(
        'rs.id',
        'in',
        suggestions.map((suggestion) => suggestion.id)
      )
      .orderBy('sig.created_at', 'desc')
      .execute();

    const evidenceBySuggestion = new Map<
      string,
      RuleSuggestionsListResult[number]['evidence']
    >();
    for (const row of evidenceRows) {
      const evidence = evidenceBySuggestion.get(row.suggestion_id) ?? [];
      if (evidence.length >= 3) continue;
      evidence.push({
        txnId: row.txn_public_id as Txn['id'],
        projectId: row.project_id as ProjectId,
        item: row.item,
        description: row.description,
        amountCents: Number(row.amount_cents),
        projectName: row.project_name,
        currency: row.currency,
        txnDate: row.txn_date,
        createdAt: row.created_at,
      });
      evidenceBySuggestion.set(row.suggestion_id, evidence);
    }

    const sourceRuleIds = Array.from(
      new Set(
        suggestions
          .map((suggestion) => suggestion.source_rule_id)
          .filter((ruleId): ruleId is string => Boolean(ruleId))
      )
    );
    const sourceRules =
      sourceRuleIds.length === 0
        ? []
        : await db
            .selectFrom('company_default_mapping_rules')
            .selectAll()
            .where('company_id', '=', args.companyId)
            .where('id', 'in', sourceRuleIds)
            .execute();
    const sourceRuleById = new Map(
      sourceRules.map((rule) => [
        rule.id,
        {
          id: asCompanyDefaultMappingRuleId(rule.id),
          companyId: rule.company_id as CompanyId,
          matchText: rule.match_text,
          companyDefaultCategoryId: asCompanyDefaultCategoryId(
            rule.company_default_category_id
          ),
          companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
            rule.company_default_sub_category_id
          ),
          sortOrder: rule.sort_order,
          createdAt: rule.created_at,
          updatedAt: rule.updated_at,
        },
      ])
    );

    return suggestions.map((row) => ({
      id: asRuleSuggestionId(row.id),
      companyId: row.company_id as CompanyId,
      status: row.status,
      suggestionType: row.suggestion_type,
      sourceRuleId: row.source_rule_id
        ? asCompanyDefaultMappingRuleId(row.source_rule_id)
        : undefined,
      patternBasis: row.pattern_basis,
      patternTextNormalized: row.pattern_text_normalized,
      proposedMatchText: row.proposed_match_text,
      matchTextAlternatives: row.match_text_alternatives,
      projectCategoryId: asCategoryId(row.project_category_id),
      projectSubCategoryId: asSubCategoryId(row.project_sub_category_id),
      companyDefaultCategoryId: asCompanyDefaultCategoryId(
        row.company_default_category_id
      ),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
        row.company_default_sub_category_id
      ),
      sampleCount: row.sample_count,
      distinctTxnDateCount: row.distinct_txn_date_count,
      distinctProjectCount: row.distinct_project_count,
      confidenceScore: row.confidence_score,
      confidence: ruleSuggestionConfidenceLevel(row.confidence_score),
      confidenceReasons: ruleSuggestionConfidenceReasons({
        sampleCount: row.sample_count,
        distinctTxnDateCount: row.distinct_txn_date_count,
        distinctProjectCount: row.distinct_project_count,
        patternBasis: row.pattern_basis,
      }),
      recommendedAction: row.recommended_action,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      acceptedRuleId: row.accepted_rule_id
        ? asCompanyDefaultMappingRuleId(row.accepted_rule_id)
        : undefined,
      acceptedAction: row.accepted_action ?? undefined,
      acceptedAt: row.accepted_at ?? undefined,
      acceptedByUserId: row.accepted_by_user_id
        ? (row.accepted_by_user_id as UserId)
        : undefined,
      dismissedAt: row.dismissed_at ?? undefined,
      dismissedReason: row.dismissed_reason ?? undefined,
      dismissedByUserId: row.dismissed_by_user_id
        ? (row.dismissed_by_user_id as UserId)
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      evidence: evidenceBySuggestion.get(row.id) ?? [],
      sourceRule: row.source_rule_id
        ? sourceRuleById.get(row.source_rule_id)
        : undefined,
    }));
  });
}

export async function dismissRuleSuggestionServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: RuleSuggestionDismissInput;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyManageDefaultsContext(
      args.context,
      args.companyId
    );
    const suggestion = await db
      .selectFrom('rule_suggestions')
      .select(['id', 'sample_count'])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .where('status', '=', 'open')
      .executeTakeFirst();
    if (!suggestion) {
      throw new AppError('NOT_FOUND', 'Unknown open rule suggestion');
    }
    const now = new Date().toISOString();
    const result = await db
      .updateTable('rule_suggestions')
      .set({
        status: 'dismissed',
        dismissed_reason: args.input.reason,
        dismissed_sample_count: suggestion.sample_count,
        dismissed_at: now,
        dismissed_by_user_id: userId,
        updated_at: now,
      })
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .where('status', '=', 'open')
      .executeTakeFirst();

    if (!result.numUpdatedRows || Number(result.numUpdatedRows) === 0) {
      throw new AppError('NOT_FOUND', 'Unknown open rule suggestion');
    }
  });
}

export async function acceptRuleSuggestionServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: RuleSuggestionAcceptInput;
}): Promise<{ ruleId: ReturnType<typeof asCompanyDefaultMappingRuleId> }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyManageDefaultsContext(
      args.context,
      args.companyId
    );
    validateOrThrow(subCategoryNameSchema, args.input.proposedMatchText);
    const matchText = args.input.proposedMatchText.trim();

    const now = new Date().toISOString();
    const ruleId = await db.transaction().execute(async (trx) => {
      const suggestion = await trx
        .selectFrom('rule_suggestions')
        .selectAll()
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.id)
        .where('status', '=', 'open')
        .forUpdate()
        .executeTakeFirst();
      if (!suggestion) {
        throw new AppError('NOT_FOUND', 'Unknown open rule suggestion');
      }

      const validAction =
        suggestion.suggestion_type === 'create_rule'
          ? args.input.action === 'create_rule'
          : args.input.action === 'update_existing' ||
            args.input.action === 'create_narrower';
      if (!validAction) {
        throw new AppError(
          'VALIDATION_ERROR',
          'The selected action is not valid for this rule suggestion'
        );
      }

      const subCategory = await trx
        .selectFrom('company_default_sub_categories')
        .select(['id', 'company_default_category_id'])
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.companyDefaultSubCategoryId)
        .executeTakeFirst();
      if (!subCategory) {
        throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
      }
      const targetCategoryId = asCompanyDefaultCategoryId(
        subCategory.company_default_category_id
      );

      const sourceRule = suggestion.source_rule_id
        ? await trx
            .selectFrom('company_default_mapping_rules')
            .selectAll()
            .where('company_id', '=', args.companyId)
            .where('id', '=', suggestion.source_rule_id)
            .forUpdate()
            .executeTakeFirst()
        : null;
      if (suggestion.suggestion_type === 'update_rule' && !sourceRule) {
        throw new AppError(
          'CONFLICT',
          'The source Auto-Categorise Rule no longer exists'
        );
      }

      const duplicateRule = await trx
        .selectFrom('company_default_mapping_rules')
        .selectAll()
        .where('company_id', '=', args.companyId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
        )
        .where(({ eb }) =>
          args.input.action === 'update_existing' && sourceRule
            ? eb('id', '!=', sourceRule.id)
            : eb.val(true)
        )
        .executeTakeFirst();

      let finalRuleId: ReturnType<typeof asCompanyDefaultMappingRuleId>;

      if (args.input.action === 'update_existing') {
        if (!sourceRule) {
          throw new AppError(
            'CONFLICT',
            'The source Auto-Categorise Rule no longer exists'
          );
        }
        if (duplicateRule) {
          throw new AppError(
            'CONFLICT',
            `Another Auto-Categorise Rule already uses "${matchText}"`
          );
        }
        await trx
          .updateTable('company_default_mapping_rules')
          .set({
            match_text: matchText,
            company_default_category_id: targetCategoryId,
            company_default_sub_category_id:
              args.input.companyDefaultSubCategoryId,
            updated_at: now,
          })
          .where('company_id', '=', args.companyId)
          .where('id', '=', sourceRule.id)
          .executeTakeFirstOrThrow();
        finalRuleId = asCompanyDefaultMappingRuleId(sourceRule.id);
      } else if (args.input.action === 'create_narrower') {
        if (!sourceRule) {
          throw new AppError(
            'CONFLICT',
            'The source Auto-Categorise Rule no longer exists'
          );
        }
        if (duplicateRule?.id === sourceRule.id) {
          throw new AppError(
            'CONFLICT',
            'Use "Update existing rule" when retaining the same match text'
          );
        }
        if (
          duplicateRule &&
          duplicateRule.company_default_sub_category_id !==
            args.input.companyDefaultSubCategoryId
        ) {
          throw new AppError(
            'CONFLICT',
            `Auto-Categorise Rule "${matchText}" already exists for a different target`
          );
        }

        if (
          duplicateRule &&
          duplicateRule.sort_order >= sourceRule.sort_order
        ) {
          await trx
            .updateTable('company_default_mapping_rules')
            .set((eb) => ({
              sort_order: eb('sort_order', '+', 1),
              updated_at: now,
            }))
            .where('company_id', '=', args.companyId)
            .where('sort_order', '>=', sourceRule.sort_order)
            .where('id', '!=', duplicateRule.id)
            .execute();
          await trx
            .updateTable('company_default_mapping_rules')
            .set({
              sort_order: sourceRule.sort_order,
              updated_at: now,
            })
            .where('company_id', '=', args.companyId)
            .where('id', '=', duplicateRule.id)
            .executeTakeFirstOrThrow();
          finalRuleId = asCompanyDefaultMappingRuleId(duplicateRule.id);
        } else if (duplicateRule) {
          finalRuleId = asCompanyDefaultMappingRuleId(duplicateRule.id);
        } else {
          await trx
            .updateTable('company_default_mapping_rules')
            .set((eb) => ({
              sort_order: eb('sort_order', '+', 1),
              updated_at: now,
            }))
            .where('company_id', '=', args.companyId)
            .where('sort_order', '>=', sourceRule.sort_order)
            .execute();
          const inserted = await trx
            .insertInto('company_default_mapping_rules')
            .values({
              id: asCompanyDefaultMappingRuleId(uid('cmap')),
              company_id: args.companyId,
              match_text: matchText,
              company_default_category_id: targetCategoryId,
              company_default_sub_category_id:
                args.input.companyDefaultSubCategoryId,
              sort_order: sourceRule.sort_order,
              created_at: now,
              updated_at: now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          finalRuleId = asCompanyDefaultMappingRuleId(inserted.id);
        }
      } else if (duplicateRule) {
        if (
          duplicateRule.company_default_sub_category_id !==
          args.input.companyDefaultSubCategoryId
        ) {
          throw new AppError(
            'CONFLICT',
            `Auto-Categorise Rule "${matchText}" already exists for a different target`
          );
        }
        finalRuleId = asCompanyDefaultMappingRuleId(duplicateRule.id);
      } else {
        const maxSort = await trx
          .selectFrom('company_default_mapping_rules')
          .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
          .where('company_id', '=', args.companyId)
          .executeTakeFirst();

        const inserted = await trx
          .insertInto('company_default_mapping_rules')
          .values({
            id: asCompanyDefaultMappingRuleId(uid('cmap')),
            company_id: args.companyId,
            match_text: matchText,
            company_default_category_id: targetCategoryId,
            company_default_sub_category_id:
              args.input.companyDefaultSubCategoryId,
            sort_order: Number(maxSort?.max_sort_order ?? -1) + 1,
            created_at: now,
            updated_at: now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        finalRuleId = asCompanyDefaultMappingRuleId(inserted.id);
      }

      const result = await trx
        .updateTable('rule_suggestions')
        .set({
          status: 'accepted',
          proposed_match_text: matchText,
          company_default_category_id: targetCategoryId,
          company_default_sub_category_id:
            args.input.companyDefaultSubCategoryId,
          accepted_rule_id: finalRuleId,
          accepted_action: args.input.action,
          accepted_at: now,
          accepted_by_user_id: userId,
          updated_at: now,
        })
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.id)
        .where('status', '=', 'open')
        .executeTakeFirst();

      if (!result.numUpdatedRows || Number(result.numUpdatedRows) === 0) {
        throw new AppError('NOT_FOUND', 'Unknown open rule suggestion');
      }

      await trx
        .deleteFrom('rule_suggestion_signals')
        .where('company_id', '=', args.companyId)
        .where('suggestion_type', '=', suggestion.suggestion_type)
        .where(
          'pattern_text_normalized',
          '=',
          suggestion.pattern_text_normalized
        )
        .where(
          'company_default_sub_category_id',
          '=',
          suggestion.company_default_sub_category_id
        )
        .where(({ eb }) =>
          suggestion.source_rule_id
            ? eb('source_rule_id', '=', suggestion.source_rule_id)
            : eb('source_rule_id', 'is', null)
        )
        .execute();

      await syncCompanyAutoCodingRulesToSyncedProjects({
        db: trx,
        companyId: args.companyId,
        actorUserId: userId,
      });

      return finalRuleId;
    });

    return { ruleId };
  });
}
