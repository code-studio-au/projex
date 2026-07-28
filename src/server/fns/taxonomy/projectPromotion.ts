import { AppError } from '../../../api/errors';
import type { PromoteProjectSubCategoryToCompanyDefaultResult } from '../../../api/types';
import type {
  CompanyDefaultCategory,
  CompanyId,
  ProjectId,
  SubCategory,
  UserId,
} from '../../../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../../../types';
import { uid } from '../../../utils/id';
import { getDb } from '../../db/db';
import { buildInheritedProjectStandardMetadata } from '../../sync/projectStandards';
import {
  companyDefaultCategorySelectColumns,
  companyDefaultSubCategorySelectColumns,
  syncCompanyDefaultTaxonomyChange,
} from './companyDefaults';

export async function promoteProjectSubCategoryToCompanyDefault(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  subCategoryId: SubCategory['id'];
  actorUserId: UserId;
}): Promise<PromoteProjectSubCategoryToCompanyDefaultResult> {
  const db = getDb();
  const subCategory = await db
    .selectFrom('sub_categories')
    .innerJoin('categories', 'categories.id', 'sub_categories.category_id')
    .select([
      'sub_categories.id as sub_id',
      'sub_categories.name as sub_name',
      'categories.id as cat_id',
      'categories.name as cat_name',
    ])
    .where('sub_categories.project_id', '=', args.projectId)
    .where('sub_categories.id', '=', args.subCategoryId)
    .executeTakeFirst();
  if (!subCategory) {
    throw new AppError('NOT_FOUND', 'Unknown project subcategory');
  }

  const normalizedCategoryName = subCategory.cat_name.trim();
  const normalizedSubCategoryName = subCategory.sub_name.trim();
  const now = new Date().toISOString();

  return db.transaction().execute(async (trx) => {
    let categoryCreated = false;
    let subCategoryCreated = false;

    let companyDefaultCategory = await trx
      .selectFrom('company_default_categories')
      .select(companyDefaultCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', normalizedCategoryName.toLowerCase())
      )
      .executeTakeFirst();
    if (!companyDefaultCategory) {
      categoryCreated = true;
      companyDefaultCategory = await trx
        .insertInto('company_default_categories')
        .values({
          id: asCompanyDefaultCategoryId(uid('ccat')),
          company_id: args.companyId,
          name: normalizedCategoryName,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultCategorySelectColumns())
        .executeTakeFirstOrThrow();
    }

    let companyDefaultSubCategory = await trx
      .selectFrom('company_default_sub_categories')
      .select(companyDefaultSubCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(
        'company_default_category_id',
        '=',
        companyDefaultCategory.id as CompanyDefaultCategory['id']
      )
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', normalizedSubCategoryName.toLowerCase())
      )
      .executeTakeFirst();
    if (!companyDefaultSubCategory) {
      subCategoryCreated = true;
      companyDefaultSubCategory = await trx
        .insertInto('company_default_sub_categories')
        .values({
          id: asCompanyDefaultSubCategoryId(uid('csub')),
          company_id: args.companyId,
          company_default_category_id:
            companyDefaultCategory.id as CompanyDefaultCategory['id'],
          name: normalizedSubCategoryName,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultSubCategorySelectColumns())
        .executeTakeFirstOrThrow();
    }

    await trx
      .updateTable('categories')
      .set({
        name: normalizedCategoryName,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultCategory.id,
          sourceUpdatedAt: companyDefaultCategory.updated_at,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', subCategory.cat_id)
      .execute();

    await trx
      .updateTable('sub_categories')
      .set({
        category_id: subCategory.cat_id,
        name: normalizedSubCategoryName,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultSubCategory.id,
          sourceUpdatedAt: companyDefaultSubCategory.updated_at,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', subCategory.sub_id)
      .execute();

    await syncCompanyDefaultTaxonomyChange({
      trx,
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      includeTaxonomy: true,
    });

    return {
      companyDefaultCategoryId: asCompanyDefaultCategoryId(
        companyDefaultCategory.id
      ),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
        companyDefaultSubCategory.id
      ),
      categoryCreated,
      subCategoryCreated,
    };
  });
}
