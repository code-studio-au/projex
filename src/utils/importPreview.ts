import type {
  BudgetLine,
  Category,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  ImportPreviewRow,
  ImportTxnWithTaxonomy,
  SubCategory,
} from '../types';
import { assignStableIds } from './csv';
import {
  findMatchingCompanyDefaultRule,
  resolveCompanyDefaultRuleToProjectTaxonomy,
} from './companyDefaultMappings';
import { txnInputSchema } from '../validation/schemas';

function sanitizeImportDate(value: string): string {
  return value
    .trim()
    .replace(/^[^0-9]+/, '')
    .replace(/[^0-9]+$/, '');
}

function dedupeKeyForTxn(t: { id: string; externalId?: string }) {
  const ext = (t.externalId ?? '').trim();
  return ext ? `external:${ext}` : `id:${t.id}`;
}

export function buildImportPreview(args: {
  importTxns: ImportTxnWithTaxonomy[];
  existingKeys: Set<string>;
  categories: Category[];
  subCategories: SubCategory[];
  budgets: BudgetLine[];
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  mappingRules: CompanyDefaultMappingRule[];
  autoCreateTaxonomy: boolean;
  canEditTaxonomy: boolean;
  autoCreateBudgets: boolean;
  canEditBudgets: boolean;
}): ImportPreviewRow[] {
  const catByName = new Map<string, Category>();
  for (const category of args.categories) {
    catByName.set(category.name.trim().toLowerCase(), category);
  }

  const categoryNameById = new Map(args.categories.map((category) => [category.id, category.name]));
  const subByKey = new Map<string, SubCategory>();
  for (const subCategory of args.subCategories) {
    const categoryName = (categoryNameById.get(subCategory.categoryId) ?? '').trim().toLowerCase();
    subByKey.set(`${categoryName}|||${subCategory.name.trim().toLowerCase()}`, subCategory);
  }

  const existingBudgetSubIds = new Set(
    args.budgets
      .map((budget) => budget.subCategoryId)
      .filter((id): id is SubCategory['id'] => Boolean(id))
  );

  const seenKeys = new Set(args.existingKeys);

  return assignStableIds(args.importTxns).map((txn, index) => {
    const warnings: string[] = [];
    const parsedDate = sanitizeImportDate(txn.date);
    const item = txn.item?.trim() ?? '';
    const description = txn.description?.trim() ?? '';
    const amountCents = Number.isFinite(txn.amountCents) ? txn.amountCents : null;

    const dedupeKey = dedupeKeyForTxn({
      id: String(txn.id ?? ''),
      externalId: txn.externalId?.trim() || undefined,
    });
    const duplicateReason = seenKeys.has(dedupeKey)
      ? (args.existingKeys.has(dedupeKey) ? 'existing' : 'import')
      : undefined;
    if (!duplicateReason) {
      seenKeys.add(dedupeKey);
    }

    let categoryId = txn.categoryId;
    let subCategoryId = txn.subCategoryId;
    let categoryName = categoryId ? categoryNameById.get(categoryId) : undefined;
    let subCategoryName = subCategoryId
      ? args.subCategories.find((subCategory) => subCategory.id === subCategoryId)?.name
      : undefined;
    let willCreateCategory = false;
    let willCreateSubCategory = false;
    let willCreateBudgetLine = false;
    let ruleId: CompanyDefaultMappingRule['id'] | undefined;
    let codingPendingApproval = false;
    let mappingStatus: ImportPreviewRow['mappingStatus'] = 'uncoded';

    const rawCategoryName = String(txn.category ?? '').trim();
    const rawSubCategoryName = String(txn.subcategory ?? '').trim();
    const hasCsvTaxonomyInput = Boolean(rawCategoryName || rawSubCategoryName);
    let csvTaxonomyBlockedRuleFallback = false;

    if (rawCategoryName) {
      const existingCategory = catByName.get(rawCategoryName.toLowerCase());
      if (existingCategory) {
        categoryId = existingCategory.id;
        categoryName = existingCategory.name;
      } else if (args.autoCreateTaxonomy && args.canEditTaxonomy) {
        willCreateCategory = true;
        categoryName = rawCategoryName;
      } else {
        warnings.push(`Category "${rawCategoryName}" does not exist in this project.`);
        csvTaxonomyBlockedRuleFallback = true;
      }
    }

    if (rawSubCategoryName && !(categoryId || willCreateCategory)) {
      warnings.push(
        `Subcategory "${rawSubCategoryName}" was provided without a project category that could be resolved.`
      );
      csvTaxonomyBlockedRuleFallback = true;
    }

    if ((categoryId || willCreateCategory) && rawSubCategoryName) {
      const effectiveCategoryName = (categoryName ?? rawCategoryName).trim().toLowerCase();
      const existingSubCategory = subByKey.get(
        `${effectiveCategoryName}|||${rawSubCategoryName.toLowerCase()}`
      );
      if (existingSubCategory) {
        subCategoryId = existingSubCategory.id;
        subCategoryName = existingSubCategory.name;
      } else if (args.autoCreateTaxonomy && args.canEditTaxonomy) {
        willCreateSubCategory = true;
        subCategoryName = rawSubCategoryName;
      } else {
        warnings.push(
          `Subcategory "${rawSubCategoryName}" does not exist under "${categoryName ?? rawCategoryName}".`
        );
        csvTaxonomyBlockedRuleFallback = true;
      }
    }

    if (subCategoryId || willCreateSubCategory) {
      mappingStatus = willCreateCategory || willCreateSubCategory ? 'auto_created' : 'csv_taxonomy';
    } else if (!hasCsvTaxonomyInput || !csvTaxonomyBlockedRuleFallback) {
      const matchedRule = findMatchingCompanyDefaultRule(
        {
          item,
          description,
        },
        args.mappingRules
      );
      if (matchedRule) {
        const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
          rule: matchedRule,
          defaultCategories: args.defaultCategories,
          defaultSubCategories: args.defaultSubCategories,
          projectCategories: args.categories,
          projectSubCategories: args.subCategories,
        });
        if (resolved) {
          categoryId = resolved.categoryId;
          subCategoryId = resolved.subCategoryId;
          categoryName = categoryNameById.get(resolved.categoryId);
          subCategoryName =
            args.subCategories.find((subCategory) => subCategory.id === resolved.subCategoryId)?.name ??
            subCategoryName;
          ruleId = matchedRule.id;
          codingPendingApproval = true;
          mappingStatus = 'matched_rule';
        } else {
          warnings.push('A company default rule matched, but its target taxonomy is missing in this project.');
        }
      }
    } else {
      warnings.push(
        'CSV category or subcategory input could not be resolved, so this row was left for manual review instead of falling back to a company rule.'
      );
    }

    if (
      args.autoCreateBudgets &&
      args.canEditBudgets &&
      Boolean(categoryId || willCreateCategory) &&
      Boolean(subCategoryId || willCreateSubCategory) &&
      !subCategoryId
    ) {
      willCreateBudgetLine = true;
    } else if (
      args.autoCreateBudgets &&
      args.canEditBudgets &&
      subCategoryId &&
      !existingBudgetSubIds.has(subCategoryId)
    ) {
      willCreateBudgetLine = true;
    }

    const parsed = txnInputSchema.safeParse({
      date: parsedDate,
      item,
      description,
      amountCents: amountCents ?? Number.NaN,
    });
    if (!parsed.success) {
      mappingStatus = 'invalid';
      for (const issue of parsed.error.issues) {
        warnings.push(issue.message);
      }
    } else if (!subCategoryId && !willCreateSubCategory) {
      warnings.push('No category/subcategory could be resolved. This row will remain uncoded.');
    }

    if (duplicateReason) {
      warnings.push(
        duplicateReason === 'existing'
          ? 'Matches an existing transaction in this project.'
          : 'Duplicates another row in this import.'
      );
    }

    return {
      sourceRowIndex: index + 1,
      importId: String(txn.id ?? ''),
      externalId: txn.externalId?.trim() || undefined,
      parsedDate: parsedDate || null,
      amountCents,
      item: item || null,
      description: description || null,
      duplicate: Boolean(duplicateReason),
      duplicateReason,
      mappingStatus,
      categoryId,
      subCategoryId,
      categoryName,
      subCategoryName,
      ruleId,
      codingSource: ruleId ? 'company_default_rule' : 'manual',
      codingPendingApproval,
      willCreateCategory,
      willCreateSubCategory,
      willCreateBudgetLine,
      warnings,
    };
  });
}
