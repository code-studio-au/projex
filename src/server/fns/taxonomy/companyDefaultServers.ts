import { AppError } from '../../../api/errors';
import type {
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
} from '../../../api/types';
import type {
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyDefaults,
  CompanyId,
} from '../../../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
} from '../../../types';
import { defaultCategoryIdForRule } from '../../../utils/companyDefaultMappings';
import { uid } from '../../../utils/id';
import {
  categoryNameSchema,
  subCategoryNameSchema,
} from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import { getDb } from '../../db/db';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  assertCompanyDefaultCategoryExists,
  assertCompanyDefaultSubCategoryBelongsToCategory,
  companyDefaultCategorySelectColumns,
  companyDefaultMappingRuleSelectColumns,
  companyDefaultSubCategorySelectColumns,
  findCompanyDefaultCategoryById,
  findCompanyDefaultMappingRuleById,
  findCompanyDefaultSubCategoryById,
  getCompanyDefaults,
  listCompanyDefaultCategories,
  listCompanyDefaultMappingRules,
  listCompanyDefaultSubCategories,
  listCompanyDefaultSubCategoryRows,
  syncCompanyDefaultTaxonomyChange,
  toCompanyDefaultCategoryId,
  toCompanyDefaultSubCategoryId,
} from './companyDefaults';
import { requireCompanyTaxonomyContext } from './context';

export async function listCompanyDefaultCategoriesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:view'
    );
    return listCompanyDefaultCategories(args.companyId);
  });
}

export async function getCompanyDefaultsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaults> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:view'
    );
    return getCompanyDefaults(args.companyId);
  });
}

export async function listCompanyDefaultSubCategoriesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultSubCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:view'
    );
    return listCompanyDefaultSubCategories(args.companyId);
  });
}

export async function listCompanyDefaultMappingRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultMappingRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:view'
    );
    return listCompanyDefaultMappingRules(args.companyId);
  });
}

export async function createCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultCategoryCreateInput;
}): Promise<CompanyDefaultCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    validateOrThrow(categoryNameSchema, args.input.name);
    const db = getDb();
    const name = args.input.name.trim();

    const existing = await db
      .selectFrom('company_default_categories')
      .select(companyDefaultCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) {
      const existingCategory = await findCompanyDefaultCategoryById({
        companyId: args.companyId,
        categoryId: existing.id,
      });
      if (!existingCategory) {
        throw new AppError('NOT_FOUND', 'Unknown company default category');
      }
      return existingCategory;
    }

    const id = args.input.id ?? asCompanyDefaultCategoryId(uid('ccat'));
    const now = new Date().toISOString();
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('company_default_categories')
        .values({
          id,
          company_id: args.companyId,
          name,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultCategorySelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });

      return created;
    });
    const createdCategory = await findCompanyDefaultCategoryById({
      companyId: args.companyId,
      categoryId: row.id,
    });
    if (!createdCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default category');
    }
    return createdCategory;
  });
}

export async function updateCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultCategoryUpdateInput;
}): Promise<CompanyDefaultCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    const existing = await db
      .selectFrom('company_default_categories')
      .select(companyDefaultCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown company default category');
    }
    if (typeof args.input.name === 'string') {
      const nextName = args.input.name.trim();
      validateOrThrow(categoryNameSchema, nextName);
      const duplicate = await db
        .selectFrom('company_default_categories')
        .select('id')
        .where('company_id', '=', args.companyId)
        .where('id', '!=', args.input.id)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', nextName.toLowerCase())
        )
        .executeTakeFirst();
      if (duplicate) {
        throw new AppError(
          'CONFLICT',
          `Company default category "${nextName}" already exists`
        );
      }
    }
    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') {
      patch.name = args.input.name.trim();
    }
    patch.updated_at = new Date().toISOString();
    const updated = await db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('company_default_categories')
        .set(patch)
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.id)
        .returning(companyDefaultCategorySelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });

      return row;
    });
    const updatedCategory = await findCompanyDefaultCategoryById({
      companyId: args.companyId,
      categoryId: updated.id,
    });
    if (!updatedCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default category');
    }
    return updatedCategory;
  });
}

export async function deleteCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  categoryId: CompanyDefaultCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('company_default_categories')
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.categoryId)
        .execute();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });
    });
  });
}

export async function createCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultSubCategoryCreateInput;
}): Promise<CompanyDefaultSubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    validateOrThrow(subCategoryNameSchema, args.input.name);
    const db = getDb();
    const name = args.input.name.trim();

    await assertCompanyDefaultCategoryExists({
      companyId: args.companyId,
      categoryId: args.input.companyDefaultCategoryId,
    });

    const existing = await db
      .selectFrom('company_default_sub_categories')
      .select(companyDefaultSubCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(
        'company_default_category_id',
        '=',
        args.input.companyDefaultCategoryId
      )
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) {
      const existingSubCategory = await findCompanyDefaultSubCategoryById({
        companyId: args.companyId,
        subCategoryId: existing.id,
      });
      if (!existingSubCategory) {
        throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
      }
      return existingSubCategory;
    }

    const id = args.input.id ?? asCompanyDefaultSubCategoryId(uid('csub'));
    const now = new Date().toISOString();
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('company_default_sub_categories')
        .values({
          id,
          company_id: args.companyId,
          company_default_category_id: args.input.companyDefaultCategoryId,
          name,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultSubCategorySelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });

      return created;
    });
    const createdSubCategory = await findCompanyDefaultSubCategoryById({
      companyId: args.companyId,
      subCategoryId: row.id,
    });
    if (!createdSubCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    }
    return createdSubCategory;
  });
}

export async function updateCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultSubCategoryUpdateInput;
}): Promise<CompanyDefaultSubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    const existing = await db
      .selectFrom('company_default_sub_categories')
      .select([
        'id',
        'company_id',
        'company_default_category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    }
    if (typeof args.input.name === 'string') {
      validateOrThrow(subCategoryNameSchema, args.input.name);
    }
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      await assertCompanyDefaultCategoryExists({
        companyId: args.companyId,
        categoryId: args.input.companyDefaultCategoryId,
      });
    }
    const nextCategoryId =
      args.input.companyDefaultCategoryId ??
      asCompanyDefaultCategoryId(existing.company_default_category_id);
    const nextName = (
      typeof args.input.name === 'string' ? args.input.name : existing.name
    ).trim();
    const duplicate = await db
      .selectFrom('company_default_sub_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where('company_default_category_id', '=', nextCategoryId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', nextName.toLowerCase())
      )
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Company default subcategory "${nextName}" already exists in this category`
      );
    }
    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') {
      patch.name = nextName;
    }
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      patch.company_default_category_id = args.input.companyDefaultCategoryId;
    }
    patch.updated_at = new Date().toISOString();
    const updated = await db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('company_default_sub_categories')
        .set(patch)
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.id)
        .returning(companyDefaultSubCategorySelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });

      return row;
    });
    const updatedSubCategory = await findCompanyDefaultSubCategoryById({
      companyId: args.companyId,
      subCategoryId: updated.id,
    });
    if (!updatedSubCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    }
    return updatedSubCategory;
  });
}

export async function deleteCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  subCategoryId: CompanyDefaultSubCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('company_default_sub_categories')
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.subCategoryId)
        .execute();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: true,
      });
    });
  });
}

export async function createCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultMappingRuleCreateInput;
}): Promise<CompanyDefaultMappingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    validateOrThrow(subCategoryNameSchema, args.input.matchText);
    const db = getDb();
    const matchText = args.input.matchText.trim();

    await assertCompanyDefaultCategoryExists({
      companyId: args.companyId,
      categoryId: args.input.companyDefaultCategoryId,
    });
    await assertCompanyDefaultSubCategoryBelongsToCategory({
      companyId: args.companyId,
      subCategoryId: args.input.companyDefaultSubCategoryId,
      categoryId: args.input.companyDefaultCategoryId,
    });

    const existing = await db
      .selectFrom('company_default_mapping_rules')
      .select(companyDefaultMappingRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
      )
      .where(
        'company_default_sub_category_id',
        '=',
        args.input.companyDefaultSubCategoryId
      )
      .executeTakeFirst();
    if (existing) {
      const existingRule = await findCompanyDefaultMappingRuleById({
        companyId: args.companyId,
        ruleId: existing.id,
      });
      if (!existingRule) {
        throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
      }
      return existingRule;
    }

    const maxSort = await db
      .selectFrom('company_default_mapping_rules')
      .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
      .where('company_id', '=', args.companyId)
      .executeTakeFirst();
    const nextSortOrder =
      typeof args.input.sortOrder === 'number'
        ? args.input.sortOrder
        : Number(maxSort?.max_sort_order ?? -1) + 1;
    const now = new Date().toISOString();
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('company_default_mapping_rules')
        .values({
          id: args.input.id ?? asCompanyDefaultMappingRuleId(uid('cmap')),
          company_id: args.companyId,
          match_text: matchText,
          company_default_category_id: args.input.companyDefaultCategoryId,
          company_default_sub_category_id:
            args.input.companyDefaultSubCategoryId,
          sort_order: nextSortOrder,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultMappingRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: false,
      });

      return created;
    });
    const createdRule = await findCompanyDefaultMappingRuleById({
      companyId: args.companyId,
      ruleId: row.id,
    });
    if (!createdRule) {
      throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
    }
    return createdRule;
  });
}

export async function updateCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultMappingRuleUpdateInput;
}): Promise<CompanyDefaultMappingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    const existing = await db
      .selectFrom('company_default_mapping_rules')
      .select(companyDefaultMappingRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
    }

    if (typeof args.input.matchText === 'string') {
      validateOrThrow(subCategoryNameSchema, args.input.matchText);
    }

    const subCategories = await listCompanyDefaultSubCategoryRows(
      args.companyId
    );
    const nextSubCategoryId =
      args.input.companyDefaultSubCategoryId ??
      toCompanyDefaultSubCategoryId(existing.company_default_sub_category_id);
    const nextCategoryId =
      args.input.companyDefaultCategoryId ??
      defaultCategoryIdForRule(
        nextSubCategoryId,
        subCategories.map((row) => ({
          id: toCompanyDefaultSubCategoryId(row.id),
          companyId: args.companyId,
          companyDefaultCategoryId: toCompanyDefaultCategoryId(
            row.company_default_category_id
          ),
          name: '',
        }))
      ) ??
      toCompanyDefaultCategoryId(existing.company_default_category_id);

    await assertCompanyDefaultCategoryExists({
      companyId: args.companyId,
      categoryId: nextCategoryId,
    });

    const subCategory = subCategories.find(
      (row) => row.id === nextSubCategoryId
    );
    if (!subCategory) {
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    }
    if (subCategory.company_default_category_id !== nextCategoryId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory does not belong to the selected company default category'
      );
    }

    const nextMatchText =
      typeof args.input.matchText === 'string'
        ? args.input.matchText.trim()
        : existing.match_text;
    const duplicate = await db
      .selectFrom('company_default_mapping_rules')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', nextMatchText.toLowerCase())
      )
      .where('company_default_sub_category_id', '=', nextSubCategoryId)
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Default mapping "${nextMatchText}" already points to this subcategory`
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof args.input.matchText === 'string') {
      patch.match_text = nextMatchText;
    }
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      patch.company_default_category_id = nextCategoryId;
    }
    if (typeof args.input.companyDefaultSubCategoryId !== 'undefined') {
      patch.company_default_sub_category_id = nextSubCategoryId;
    }
    if (typeof args.input.sortOrder === 'number') {
      patch.sort_order = args.input.sortOrder;
    }

    const updated = await db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('company_default_mapping_rules')
        .set(patch)
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.id)
        .returning(companyDefaultMappingRuleSelectColumns())
        .executeTakeFirstOrThrow();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: false,
      });

      return row;
    });
    const updatedRule = await findCompanyDefaultMappingRuleById({
      companyId: args.companyId,
      ruleId: updated.id,
    });
    if (!updatedRule) {
      throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
    }
    return updatedRule;
  });
}

export async function deleteCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  ruleId: CompanyDefaultMappingRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireCompanyTaxonomyContext(
      args.context,
      args.companyId,
      'company:manage_defaults'
    );
    const db = getDb();
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('company_default_mapping_rules')
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.ruleId)
        .execute();

      await syncCompanyDefaultTaxonomyChange({
        trx,
        companyId: args.companyId,
        actorUserId: userId,
        includeTaxonomy: false,
      });
    });
  });
}
