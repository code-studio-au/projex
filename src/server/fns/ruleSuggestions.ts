import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
  RuleSuggestionsListResult,
} from '../../api/types';
import type { Txn } from '../../types';
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
  deriveRuleSuggestionPattern,
  didManualCodingTargetChange,
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

type SuggestionKey = {
  companyId: CompanyId;
  suggestionType: 'create_rule';
  patternTextNormalized: string;
  companyDefaultSubCategoryId: ReturnType<typeof asCompanyDefaultSubCategoryId>;
};

type ExistingSignalRow = {
  id: string;
  company_id: string;
  suggestion_type: 'create_rule';
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
};

function buildSuggestionKey(row: {
  company_id: string;
  suggestion_type: 'create_rule';
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
}): SuggestionKey {
  return {
    companyId: row.company_id as CompanyId,
    suggestionType: row.suggestion_type,
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
      .select(['id', 'name'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.categoryId)
      .executeTakeFirst(),
    args.db
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'name'])
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

  if (!projectCategory || !projectSubCategory) return null;

  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, ' ');
  const projectCategoryName = normalize(projectCategory.name);
  const projectSubCategoryName = normalize(projectSubCategory.name);

  const defaultCategory = defaultCategories.find(
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
    .selectFrom('rule_suggestion_signals')
    .select([
      'id',
      'company_id',
      'pattern_text_raw',
      'pattern_text_normalized',
      'project_category_id',
      'project_sub_category_id',
      'company_default_category_id',
      'company_default_sub_category_id',
      'created_at',
      'updated_at',
    ])
    .where('company_id', '=', key.companyId)
    .where('suggestion_type', '=', key.suggestionType)
    .where('pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .orderBy('created_at', 'asc')
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
      .where('status', '=', 'open')
      .execute();
    return;
  }

  const sampleCount = signals.length;
  const firstSignal = signals[0]!;
  const lastSignal = signals[signals.length - 1]!;
  const now = new Date().toISOString();

  const existing = await db
    .selectFrom('rule_suggestions')
    .select(['id', 'status'])
    .where('company_id', '=', key.companyId)
    .where('suggestion_type', '=', key.suggestionType)
    .where('pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .executeTakeFirst();

  const nextValues = {
    status: 'open' as const,
    proposed_match_text: firstSignal.pattern_text_raw,
    project_category_id: firstSignal.project_category_id,
    project_sub_category_id: firstSignal.project_sub_category_id,
    company_default_category_id: firstSignal.company_default_category_id,
    company_default_sub_category_id:
      firstSignal.company_default_sub_category_id,
    sample_count: sampleCount,
    first_seen_at: firstSignal.created_at,
    last_seen_at: lastSignal.updated_at,
    updated_at: now,
    accepted_rule_id: null,
    accepted_at: null,
    accepted_by_user_id: null,
    dismissed_at: null,
    dismissed_by_user_id: null,
  };

  if (existing) {
    await db
      .updateTable('rule_suggestions')
      .set(nextValues)
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
      pattern_text_normalized: key.patternTextNormalized,
      proposed_match_text: firstSignal.pattern_text_raw,
      project_category_id: firstSignal.project_category_id,
      project_sub_category_id: firstSignal.project_sub_category_id,
      company_default_category_id: firstSignal.company_default_category_id,
      company_default_sub_category_id:
        firstSignal.company_default_sub_category_id,
      sample_count: sampleCount,
      first_seen_at: firstSignal.created_at,
      last_seen_at: lastSignal.updated_at,
      accepted_rule_id: null,
      accepted_at: null,
      accepted_by_user_id: null,
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
      'pattern_text_normalized',
      'company_default_sub_category_id',
    ])
    .where('txn_public_id', '=', args.next.id)
    .where('suggestion_type', '=', 'create_rule')
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

  const now = new Date().toISOString();
  const nextKey: SuggestionKey = {
    companyId: args.next.companyId,
    suggestionType: 'create_rule',
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
        suggestion_type: 'create_rule',
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
        suggestion_type: 'create_rule',
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
      )
      .innerJoin('txns as t', (join) =>
        join
          .onRef('sig.project_id', '=', 't.project_id')
          .onRef('sig.txn_public_id', '=', 't.public_id')
      )
      .select([
        'rs.id as suggestion_id',
        'sig.txn_public_id',
        'sig.project_id',
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
        txnDate: row.txn_date,
        createdAt: row.created_at,
      });
      evidenceBySuggestion.set(row.suggestion_id, evidence);
    }

    return suggestions.map((row) => ({
      id: asRuleSuggestionId(row.id),
      companyId: row.company_id as CompanyId,
      status: row.status,
      suggestionType: row.suggestion_type,
      patternTextNormalized: row.pattern_text_normalized,
      proposedMatchText: row.proposed_match_text,
      projectCategoryId: asCategoryId(row.project_category_id),
      projectSubCategoryId: asSubCategoryId(row.project_sub_category_id),
      companyDefaultCategoryId: asCompanyDefaultCategoryId(
        row.company_default_category_id
      ),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
        row.company_default_sub_category_id
      ),
      sampleCount: row.sample_count,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      acceptedRuleId: row.accepted_rule_id
        ? asCompanyDefaultMappingRuleId(row.accepted_rule_id)
        : undefined,
      acceptedAt: row.accepted_at ?? undefined,
      acceptedByUserId: row.accepted_by_user_id
        ? (row.accepted_by_user_id as UserId)
        : undefined,
      dismissedAt: row.dismissed_at ?? undefined,
      dismissedByUserId: row.dismissed_by_user_id
        ? (row.dismissed_by_user_id as UserId)
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      evidence: evidenceBySuggestion.get(row.id) ?? [],
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
    const now = new Date().toISOString();
    const result = await db
      .updateTable('rule_suggestions')
      .set({
        status: 'dismissed',
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

    const suggestion = await db
      .selectFrom('rule_suggestions')
      .selectAll()
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .where('status', '=', 'open')
      .executeTakeFirst();
    if (!suggestion) {
      throw new AppError('NOT_FOUND', 'Unknown open rule suggestion');
    }

    const category = await db
      .selectFrom('company_default_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultCategoryId)
      .executeTakeFirst();
    if (!category) {
      throw new AppError('NOT_FOUND', 'Unknown company default category');
    }

    const subCategory = await db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'company_default_category_id'])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultSubCategoryId)
      .executeTakeFirst();
    if (!subCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    }
    if (
      subCategory.company_default_category_id !==
      args.input.companyDefaultCategoryId
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory does not belong to the selected company default category'
      );
    }

    const existingRule = await db
      .selectFrom('company_default_mapping_rules')
      .select(['id', 'company_default_sub_category_id'])
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
      )
      .executeTakeFirst();

    if (
      existingRule &&
      existingRule.company_default_sub_category_id !==
        args.input.companyDefaultSubCategoryId
    ) {
      throw new AppError(
        'CONFLICT',
        `Auto-Categorise Rule "${matchText}" already exists for a different target`
      );
    }

    const now = new Date().toISOString();
    const ruleId = await db.transaction().execute(async (trx) => {
      let finalRuleId: ReturnType<typeof asCompanyDefaultMappingRuleId>;

      if (existingRule) {
        finalRuleId = asCompanyDefaultMappingRuleId(existingRule.id);
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
            company_default_category_id: args.input.companyDefaultCategoryId,
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
          company_default_category_id: args.input.companyDefaultCategoryId,
          company_default_sub_category_id:
            args.input.companyDefaultSubCategoryId,
          accepted_rule_id: finalRuleId,
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
