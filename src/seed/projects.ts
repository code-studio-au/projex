import type { Project } from '../types/index.ts';
import { asCompanyId, asProjectId } from '../types/index.ts';

export const seedProjects: Project[] = [
  {
    id: asProjectId('prj_acme_alpha'),
    companyId: asCompanyId('co_acme'),
    name: 'Alpha',
    budgetTotalCents: 5000000,
    currency: 'AUD',
    status: 'active',
    visibility: 'company',
  },
  {
    id: asProjectId('prj_acme_beta'),
    companyId: asCompanyId('co_acme'),
    name: 'Beta',
    budgetTotalCents: 2500000,
    currency: 'AUD',
    status: 'active',
    visibility: 'company',
  },
  {
    id: asProjectId('prj_globex_ops'),
    companyId: asCompanyId('co_globex'),
    name: 'Ops Modernisation',
    budgetTotalCents: 4000000,
    currency: 'AUD',
    status: 'active',
    visibility: 'company',
  },
];
