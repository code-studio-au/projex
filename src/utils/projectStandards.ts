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
