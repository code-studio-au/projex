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
  | 'id'
  | 'name'
  | 'projectType'
  | 'parentProjectId'
  | 'status'
  | 'visibility'
  | 'currency'
  | 'budgetTotalCents'
>;

export type CompanySummaryTxnInput = {
  projectId: ProjectId;
  date: DateOnlyInput;
  amountCents: number;
  budgetImpact: boolean;
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
    if (!transaction.budgetImpact) continue;

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
      args.validSubCategoryIdsByProject.get(transaction.projectId) ??
      new Set<string>();

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

  const summaries = args.projects.map((project) => {
    const monthBuckets =
      monthBucketsByProject.get(project.id) ??
      new Map<string, CompanySummaryMonthBucket>();
    return {
      id: project.id,
      name: project.name,
      projectType: project.projectType,
      parentProjectId: project.parentProjectId,
      status: project.status,
      visibility: project.visibility,
      currency: project.currency,
      budgetCents:
        project.projectType === 'programme' ? 0 : project.budgetTotalCents,
      months: [...monthBuckets.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([monthKey, bucket]) => ({ monthKey, ...bucket })),
    };
  });

  const byId = new Map(summaries.map((project) => [project.id, project]));
  const childrenByProgramme = new Map<ProjectId, CompanySummaryProject[]>();
  const topLevel: CompanySummaryProject[] = [];

  for (const project of summaries) {
    if (
      project.parentProjectId &&
      byId.get(project.parentProjectId)?.projectType === 'programme' &&
      byId.get(project.parentProjectId)?.status === 'active'
    ) {
      const children = childrenByProgramme.get(project.parentProjectId) ?? [];
      children.push(project);
      childrenByProgramme.set(project.parentProjectId, children);
    } else {
      topLevel.push(project);
    }
  }

  return topLevel.map((project) => {
    if (project.projectType !== 'programme') return project;

    const children = (childrenByProgramme.get(project.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const activeChildren = children.filter(
      (child) => child.status === 'active'
    );
    const monthBuckets = new Map<string, CompanySummaryMonthBucket>();

    for (const child of activeChildren) {
      for (const month of child.months) {
        const bucket = monthBuckets.get(month.monthKey) ?? {
          actualCodedCents: 0,
          uncodedCount: 0,
          uncodedAmountCents: 0,
        };
        bucket.actualCodedCents += month.actualCodedCents;
        bucket.uncodedCount += month.uncodedCount;
        bucket.uncodedAmountCents += month.uncodedAmountCents;
        monthBuckets.set(month.monthKey, bucket);
      }
    }

    return {
      ...project,
      budgetCents: activeChildren.reduce(
        (total, child) => total + child.budgetCents,
        0
      ),
      months: [...monthBuckets.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([monthKey, bucket]) => ({ monthKey, ...bucket })),
      children,
    };
  });
}
