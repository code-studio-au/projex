import type { Project } from '../types';
import { asCompanyId, asProjectId } from '../types';

export const seedProjects: Project[] = [
  {
    id: asProjectId('prj_acme_alpha'),
    companyId: asCompanyId('co_acme'),
    name: 'Alpha',
    currency: 'AUD',
    status: 'active',
  },
  {
    id: asProjectId('prj_acme_beta'),
    companyId: asCompanyId('co_acme'),
    name: 'Beta',
    currency: 'AUD',
    status: 'active',
  },
  {
    id: asProjectId('prj_globex_ops'),
    companyId: asCompanyId('co_globex'),
    name: 'Ops Modernisation',
    currency: 'AUD',
    status: 'active',
  },
];
