import { z } from 'zod';

import type { Session } from '../api/types';
import type { PersistedStateV1, SeedCompanyDefaultTaxonomySlice } from '../seed';
import type { SeedProjectDataSlice } from '../seed/projectData';
import { asCompanyId, asProjectId } from '../types';
import {
  authenticatedSessionResponseSchema,
  budgetLinesResponseSchema,
  categoriesResponseSchema,
  companiesResponseSchema,
  companyDefaultCategoriesResponseSchema,
  companyDefaultMappingRulesResponseSchema,
  companyDefaultSubCategoriesResponseSchema,
  companyMembershipsResponseSchema,
  projectMembershipsResponseSchema,
  projectsResponseSchema,
  subCategoriesResponseSchema,
  txnsResponseSchema,
  usersResponseSchema,
} from './responseSchemas';

const localCompanyDefaultsSliceCompatSchema = z.object({
  categories: companyDefaultCategoriesResponseSchema.default([]),
  subCategories: companyDefaultSubCategoriesResponseSchema.default([]),
  mappingRules: companyDefaultMappingRulesResponseSchema.default([]),
});

const localProjectDataSliceSchema: z.ZodType<SeedProjectDataSlice> = z.object({
  budgets: budgetLinesResponseSchema,
  transactions: txnsResponseSchema,
  categories: categoriesResponseSchema,
  subCategories: subCategoriesResponseSchema,
});

const persistedStateCompatSchema = z.object({
  users: usersResponseSchema,
  companies: companiesResponseSchema,
  projects: projectsResponseSchema,
  companyMemberships: companyMembershipsResponseSchema,
  projectMemberships: projectMembershipsResponseSchema,
  dataByProjectId: z.record(z.string(), localProjectDataSliceSchema),
  companyDefaultsByCompanyId: z
    .record(z.string(), localCompanyDefaultsSliceCompatSchema)
    .optional(),
  activeCompanyId: z.string().trim().min(1),
  activeProjectId: z.string().trim().min(1).nullable(),
});

type PersistedStateCompat = z.infer<typeof persistedStateCompatSchema>;

function normalizeCompanyDefaultsByCompanyId(
  state: PersistedStateCompat
): PersistedStateV1['companyDefaultsByCompanyId'] {
  const next = {} as PersistedStateV1['companyDefaultsByCompanyId'];

  for (const company of state.companies) {
    const existing = state.companyDefaultsByCompanyId?.[company.id];
    const slice: SeedCompanyDefaultTaxonomySlice = {
      categories: existing?.categories ?? [],
      subCategories: existing?.subCategories ?? [],
      mappingRules: existing?.mappingRules ?? [],
    };
    next[company.id] = slice;
  }

  return next;
}

function normalizeDataByProjectId(
  state: PersistedStateCompat
): PersistedStateV1['dataByProjectId'] {
  const next = {} as PersistedStateV1['dataByProjectId'];

  for (const [projectId, slice] of Object.entries(state.dataByProjectId)) {
    next[asProjectId(projectId)] = slice;
  }

  return next;
}

export const localSessionSchema: z.ZodType<Session> = authenticatedSessionResponseSchema;

export const localPersistedStateSchema = persistedStateCompatSchema.transform((state) => {
  if (!state.companies.length) {
    throw new Error('Persisted state must include at least one company.');
  }

  const companies = state.companies;
  const projects = state.projects;
  const activeCompanyId = companies.some((company) => company.id === state.activeCompanyId)
    ? asCompanyId(state.activeCompanyId)
    : companies[0].id;
  const activeProjectId =
    state.activeProjectId && projects.some((project) => project.id === state.activeProjectId)
      ? asProjectId(state.activeProjectId)
      : null;

  return {
    users: state.users,
    companies,
    projects,
    companyMemberships: state.companyMemberships,
    projectMemberships: state.projectMemberships,
    dataByProjectId: normalizeDataByProjectId(state),
    companyDefaultsByCompanyId: normalizeCompanyDefaultsByCompanyId(state),
    activeCompanyId,
    activeProjectId,
  } satisfies PersistedStateV1;
});
