import type { Kysely } from 'kysely';

import type { RuleSuggestionType, Txn } from '../../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asRuleSuggestionSignalId,
  type CompanyId,
  type ProjectId,
  type UserId,
} from '../../types';
import { uid } from '../../utils/id';
import {
  deriveRuleSuggestionPattern,
  didManualCodingTargetChange,
} from '../../utils/ruleSuggestions';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import {
  buildSuggestionKey,
  type ExistingSignalRow,
  lockSuggestionKeys,
  refreshSuggestionAggregate,
  type SuggestionKey,
  suggestionKeysEqual,
} from './ruleSuggestions/aggregation';
export {
  acceptRuleSuggestionServer,
  dismissRuleSuggestionServer,
} from './ruleSuggestions/reviewServers';
export { listRuleSuggestionsServer } from './ruleSuggestions/readServers';

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
    companyDefaultCategoryId: asCompanyDefaultCategoryId(defaultCategory.id),
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
      defaultSubCategory.id
    ),
  };
}

export async function recordManualRuleSuggestionSignal(args: {
  db?: Kysely<DB>;
  userId: UserId;
  prev: Txn;
  next: Txn;
}): Promise<void> {
  const db = args.db ?? getDb();
  await db.transaction().execute(async (trx) => {
    await recordManualRuleSuggestionSignalInTransaction({
      db: trx,
      userId: args.userId,
      prev: args.prev,
      next: args.next,
    });
  });
}

async function recordManualRuleSuggestionSignalInTransaction(args: {
  db: Kysely<DB>;
  userId: UserId;
  prev: Txn;
  next: Txn;
}): Promise<void> {
  const db = args.db;
  const existingSignal = (await db
    .selectFrom('rule_suggestion_signals')
    .select([
      'id',
      'project_id',
      'txn_public_id',
      'company_id',
      'suggestion_type',
      'source_rule_id',
      'pattern_text_normalized',
      'company_default_sub_category_id',
    ])
    .where('project_id', '=', args.next.projectId)
    .where('txn_public_id', '=', args.next.id)
    .forUpdate()
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
      await lockSuggestionKeys(db, [prevKey!]);
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .where('project_id', '=', args.next.projectId)
        .where('txn_public_id', '=', args.next.id)
        .execute();
      await refreshSuggestionAggregate(db, prevKey!);
    }
    return;
  }

  const pattern = deriveRuleSuggestionPattern(args.next);
  if (!pattern || !args.next.categoryId || !args.next.subCategoryId) {
    if (existingSignal) {
      await lockSuggestionKeys(db, [prevKey!]);
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .where('project_id', '=', args.next.projectId)
        .where('txn_public_id', '=', args.next.id)
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
      await lockSuggestionKeys(db, [prevKey!]);
      await db
        .deleteFrom('rule_suggestion_signals')
        .where('id', '=', existingSignal.id)
        .where('project_id', '=', args.next.projectId)
        .where('txn_public_id', '=', args.next.id)
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
  await lockSuggestionKeys(
    db,
    prevKey && !suggestionKeysEqual(prevKey, nextKey)
      ? [prevKey, nextKey]
      : [nextKey]
  );

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
        company_default_category_id: resolvedTarget.companyDefaultCategoryId,
        company_default_sub_category_id:
          resolvedTarget.companyDefaultSubCategoryId,
        acted_by_user_id: args.userId,
        updated_at: now,
      })
      .where('id', '=', existingSignal.id)
      .where('project_id', '=', args.next.projectId)
      .where('txn_public_id', '=', args.next.id)
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
