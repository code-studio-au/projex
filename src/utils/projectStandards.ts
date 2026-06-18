import type {
  ProjectStandardOriginScope,
  ProjectStandardSyncStatus,
} from '../types';

export type ProjectStandardLike = {
  originScope?: ProjectStandardOriginScope;
  syncStatus?: ProjectStandardSyncStatus;
};

export function isInheritedCompanyStandard(item: ProjectStandardLike) {
  return item.originScope === 'company' && item.syncStatus === 'inherited';
}

export function isCompanyBackedStandard(item: ProjectStandardLike) {
  return item.originScope === 'company';
}

export function getProjectStandardBadge(item: ProjectStandardLike) {
  if (item.syncStatus === 'inherited') {
    return {
      label: 'Inherited from company',
      color: 'teal',
    } as const;
  }

  if (item.syncStatus === 'overridden') {
    return {
      label: 'Project override',
      color: 'orange',
    } as const;
  }

  if (item.syncStatus === 'detached') {
    return {
      label: 'Detached from company',
      color: 'gray',
    } as const;
  }

  return {
    label: 'Project local',
    color: 'indigo',
  } as const;
}

export function describeProjectStandard(item: ProjectStandardLike) {
  if (item.syncStatus === 'inherited') {
    return 'Inherited from company. Editing here creates a project-specific override.';
  }

  if (item.syncStatus === 'overridden') {
    return 'Originally inherited from company, then changed locally for this project.';
  }

  if (item.syncStatus === 'detached') {
    return 'Previously linked to a company standard, but the company source was removed or changed.';
  }

  return 'Project-specific structure that applies only within this project.';
}

export function summarizeProjectStandardStates(items: ProjectStandardLike[]) {
  return items.reduce(
    (summary, item) => {
      if (item.syncStatus === 'inherited') summary.inherited += 1;
      else if (item.syncStatus === 'overridden') summary.overridden += 1;
      else if (item.syncStatus === 'detached') summary.detached += 1;
      else summary.local += 1;

      if (item.originScope === 'company') summary.companyBacked += 1;
      return summary;
    },
    {
      local: 0,
      inherited: 0,
      overridden: 0,
      detached: 0,
      companyBacked: 0,
    }
  );
}
