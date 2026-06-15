import type { Kysely } from 'kysely';
import { AppError } from '../../api/errors';
import type {
  CreateProjectAutoCodingRuleInput,
  CreateProjectAutoCodingRuleResult,
  ProjectAutoCodingRuleUpdateInput,
  ProjectRuleSuggestionPrompt,
} from '../../api/types';
import type { ProjectAutoCodingRule, ProjectId } from '../../types';
import {
  asCategoryId,
  asProjectAutoCodingRuleId,
  asSubCategoryId,
  type Txn,
} from '../../types';
import { uid } from '../../utils/id';
import { deriveRuleSuggestionPattern } from '../../utils/ruleSuggestions';
import { findMatchingProjectAutoCodingRule } from '../../utils/projectAutoCodingRules';
import {
  textRuleMatches,
  transactionRuleHaystack,
} from '../../utils/textRuleMatching';
import { validateOrThrow } from '../../validation/validate';
import { subCategoryNameSchema } from '../../validation/schemas';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import { toTxn } from '../mappers/transactionRows';
import {
  requireOperationalProjectForAction,
  assertCategoryInProject,
  assertSubCategoryInProject,
} from './resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

const PROJECT_RULE_PROMPT_THRESHOLD = 3;

function toProjectAutoCodingRule(row: {
  id: string;
  company_id: string;
  project_id: string;
  match_text: string;
  category_id: string;
  sub_category_id: string;
  sort_order: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}): ProjectAutoCodingRule {
  return {
    id: asProjectAutoCodingRuleId(row.id),
    companyId: row.company_id as ProjectAutoCodingRule['companyId'],
    projectId: row.project_id as ProjectId,
    matchText: row.match_text,
    categoryId: row.category_id as ProjectAutoCodingRule['categoryId'],
    subCategoryId: asSubCategoryId(row.sub_category_id),
    sortOrder: row.sort_order,
    createdByUserId:
      row.created_by_user_id as ProjectAutoCodingRule['createdByUserId'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProjectRules(
  db: ReturnType<typeof getDb>,
  projectId: ProjectId
) {
  const rows = await db
    .selectFrom('project_auto_coding_rules')
    .select([
      'id',
      'company_id',
      'project_id',
      'match_text',
      'category_id',
      'sub_category_id',
      'sort_order',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(toProjectAutoCodingRule);
}

export async function listProjectAutoCodingRulesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ProjectAutoCodingRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    return listProjectRules(db, args.projectId);
  });
}

async function listProjectTransactions(db: Kysely<DB>, projectId: ProjectId) {
  const rows = await db
    .selectFrom('txns')
    .select([
      'id',
      'public_id',
      'external_id',
      'company_id',
      'project_id',
      'txn_date',
      'item',
      'description',
      'amount_cents',
      'txn_type',
      'parent_public_id',
      'source_public_id',
      'transfer_project_id',
      'budget_impact',
      'categorisable',
      'import_batch_id',
      'import_source_type',
      'import_source_meta',
      'category_id',
      'sub_category_id',
      'company_default_mapping_rule_id',
      'coding_source',
      'coding_pending_approval',
      'reviewed_at',
      'reviewed_by_user_id',
      'locked_at',
      'locked_by_user_id',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
  return rows.map(toTxn);
}

export async function getProjectRuleSuggestionPromptServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: Txn['id'];
}): Promise<ProjectRuleSuggestionPrompt | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const txns = await listProjectTransactions(db, args.projectId);
    const txn = txns.find((row: Txn) => row.id === args.txnId);
    if (
      !txn ||
      txn.codingSource !== 'manual' ||
      !txn.categoryId ||
      !txn.subCategoryId
    ) {
      return null;
    }

    const pattern = deriveRuleSuggestionPattern(txn);
    if (!pattern) return null;

    const rules = await listProjectRules(db, args.projectId);
    const alreadyCovered = findMatchingProjectAutoCodingRule(txn, rules);
    if (alreadyCovered) return null;

    const supportingCount = txns.filter((candidate: Txn) => {
      if (
        candidate.codingSource !== 'manual' ||
        candidate.categoryId !== txn.categoryId ||
        candidate.subCategoryId !== txn.subCategoryId
      ) {
        return false;
      }
      const candidatePattern = deriveRuleSuggestionPattern(candidate);
      return candidatePattern?.normalized === pattern.normalized;
    }).length;

    if (supportingCount < PROJECT_RULE_PROMPT_THRESHOLD) {
      return null;
    }

    return {
      txnId: txn.id,
      suggestedMatchText: pattern.proposedMatchText,
      categoryId: txn.categoryId,
      subCategoryId: txn.subCategoryId,
      supportingCount,
    };
  });
}

export async function createProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CreateProjectAutoCodingRuleInput;
}): Promise<CreateProjectAutoCodingRuleResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db, userId, companyId } = context;
    validateOrThrow(subCategoryNameSchema, args.input.matchText);
    await assertCategoryInProject({
      db,
      projectId: args.projectId,
      categoryId: args.input.categoryId,
    });
    await assertSubCategoryInProject({
      db,
      projectId: args.projectId,
      subCategoryId: args.input.subCategoryId,
      categoryId: args.input.categoryId,
    });

    const matchText = args.input.matchText.trim();
    const now = new Date().toISOString();

    const result = await db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('project_auto_coding_rules')
        .select([
          'id',
          'company_id',
          'project_id',
          'match_text',
          'category_id',
          'sub_category_id',
          'sort_order',
          'created_by_user_id',
          'created_at',
          'updated_at',
        ])
        .where('project_id', '=', args.projectId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
        )
        .where('sub_category_id', '=', args.input.subCategoryId)
        .executeTakeFirst();

      let rule: ProjectAutoCodingRule;
      if (existing) {
        rule = toProjectAutoCodingRule(existing);
      } else {
        const maxSort = await trx
          .selectFrom('project_auto_coding_rules')
          .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
          .where('project_id', '=', args.projectId)
          .executeTakeFirst();
        const inserted = await trx
          .insertInto('project_auto_coding_rules')
          .values({
            id: asProjectAutoCodingRuleId(uid('prule')),
            company_id: companyId,
            project_id: args.projectId,
            match_text: matchText,
            category_id: args.input.categoryId,
            sub_category_id: args.input.subCategoryId,
            sort_order: Number(maxSort?.max_sort_order ?? -1) + 1,
            created_by_user_id: userId,
            created_at: now,
            updated_at: now,
          })
          .returning([
            'id',
            'company_id',
            'project_id',
            'match_text',
            'category_id',
            'sub_category_id',
            'sort_order',
            'created_by_user_id',
            'created_at',
            'updated_at',
          ])
          .executeTakeFirstOrThrow();
        rule = toProjectAutoCodingRule(inserted);
      }

      const txns = await listProjectTransactions(trx, args.projectId);
      const matchedTxnIds = txns
        .filter((txn: Txn) => {
          if (txn.lockedAt || !txn.categorisable) return false;
          const hasValidCoding = Boolean(txn.subCategoryId);
          if (hasValidCoding) return false;
          return textRuleMatches({
            haystack: transactionRuleHaystack(txn),
            needle: matchText,
          });
        })
        .map((txn: Txn) => txn.id);

      if (matchedTxnIds.length > 0) {
        await trx
          .updateTable('txns')
          .set({
            category_id: args.input.categoryId,
            sub_category_id: args.input.subCategoryId,
            company_default_mapping_rule_id: null,
            coding_source: 'project_rule',
            coding_pending_approval: true,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('public_id', 'in', matchedTxnIds)
          .where('locked_at', 'is', null)
          .execute();
      }

      return {
        rule,
        matchedTxnCount: matchedTxnIds.length,
      };
    });

    return result;
  });
}

export async function updateProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: ProjectAutoCodingRuleUpdateInput;
}): Promise<ProjectAutoCodingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const existing = await db
      .selectFrom('project_auto_coding_rules')
      .select([
        'id',
        'company_id',
        'project_id',
        'match_text',
        'category_id',
        'sub_category_id',
        'sort_order',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown project auto-coding rule');
    }

    if (args.input.matchText != null) {
      validateOrThrow(subCategoryNameSchema, args.input.matchText);
    }

    const nextCategoryId =
      args.input.categoryId ?? asCategoryId(existing.category_id);
    const nextSubCategoryId =
      args.input.subCategoryId ?? asSubCategoryId(existing.sub_category_id);

    if (args.input.categoryId != null || args.input.subCategoryId != null) {
      await assertCategoryInProject({
        db,
        projectId: args.projectId,
        categoryId: nextCategoryId,
      });
      await assertSubCategoryInProject({
        db,
        projectId: args.projectId,
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
      });
    }

    const nextMatchText = args.input.matchText?.trim() ?? existing.match_text;
    const duplicate = await db
      .selectFrom('project_auto_coding_rules')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '!=', args.input.id)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', nextMatchText.toLowerCase())
      )
      .where('sub_category_id', '=', nextSubCategoryId)
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        'A project auto-coding rule already exists for that match text and subcategory'
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (args.input.matchText != null) patch.match_text = nextMatchText;
    if (args.input.categoryId != null)
      patch.category_id = args.input.categoryId;
    if (args.input.subCategoryId != null) {
      patch.sub_category_id = args.input.subCategoryId;
    }
    if (args.input.sortOrder != null) patch.sort_order = args.input.sortOrder;

    const updated = await db
      .updateTable('project_auto_coding_rules')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'project_id',
        'match_text',
        'category_id',
        'sub_category_id',
        'sort_order',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toProjectAutoCodingRule(updated);
  });
}

export async function deleteProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  ruleId: ProjectAutoCodingRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const deleted = await db
      .deleteFrom('project_auto_coding_rules')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .returning('id')
      .executeTakeFirst();
    if (!deleted) {
      throw new AppError('NOT_FOUND', 'Unknown project auto-coding rule');
    }
  });
}
