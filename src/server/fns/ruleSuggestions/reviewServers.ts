import { AppError } from '../../../api/errors';
import type {
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
} from '../../../api/types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  type CompanyId,
} from '../../../types';
import { uid } from '../../../utils/id';
import { subCategoryNameSchema } from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import { requireAuthorized } from '../../auth/authorize';
import { getDb } from '../../db/db';
import { syncCompanyAutoCodingRulesToSyncedProjects } from '../projectAutoCodingRules';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';

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
