import type {
  CompanySummaryProject,
  Project,
  ProjectId,
  SubCategoryId,
} from '../types';
import { monthKeyFromDateOnlyInput, type DateOnlyInput } from './finance';

type CompanySummaryMonthBucket = {
  actualCodedCents: number;
  uncodedCount: number;
  uncodedAmountCents: number;
};

type CompanySummaryProjectInput = Pick<
  Project,
  'id' | 'name' | 'status' | 'visibility' | 'currency' | 'budgetTotalCents'
>;

export type CompanySummaryTxnInput = {
  projectId: ProjectId;
  date: DateOnlyInput;
  amountCents: number;
  subCategoryId?: SubCategoryId | string | null;
};

export function buildCompanySummaryProjects(args: {
  projects: CompanySummaryProjectInput[];
  transactions: CompanySummaryTxnInput[];
  validSubCategoryIdsByProject: Map<ProjectId, Set<string>>;
}): CompanySummaryProject[] {
  const monthBucketsByProject = new Map<
    ProjectId,
    Map<string, CompanySummaryMonthBucket>
  >();

  for (const transaction of args.transactions) {
    const monthKey = monthKeyFromDateOnlyInput(transaction.date);
    if (!monthKey) continue;

    const projectBuckets =
      monthBucketsByProject.get(transaction.projectId) ??
      new Map<string, CompanySummaryMonthBucket>();
    const bucket = projectBuckets.get(monthKey) ?? {
      actualCodedCents: 0,
      uncodedCount: 0,
      uncodedAmountCents: 0,
    };
    const amount = Math.abs(Number(transaction.amountCents ?? 0));
    const validSubIds =
      args.validSubCategoryIdsByProject.get(transaction.projectId) ?? new Set<string>();

    if (
      transaction.subCategoryId &&
      validSubIds.has(String(transaction.subCategoryId))
    ) {
      bucket.actualCodedCents += amount;
    } else {
      bucket.uncodedCount += 1;
      bucket.uncodedAmountCents += amount;
    }

    projectBuckets.set(monthKey, bucket);
    monthBucketsByProject.set(transaction.projectId, projectBuckets);
  }

  return args.projects.map((project) => {
    const monthBuckets =
      monthBucketsByProject.get(project.id) ??
      new Map<string, CompanySummaryMonthBucket>();
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      visibility: project.visibility,
      currency: project.currency,
      budgetCents: project.budgetTotalCents,
      months: [...monthBuckets.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([monthKey, bucket]) => ({ monthKey, ...bucket })),
    };
  });
}
