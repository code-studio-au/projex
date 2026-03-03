import type { Company } from '../types/index.ts';
import { asCompanyId } from '../types/index.ts';

export const seedCompanies: Company[] = [
  { id: asCompanyId('co_projex'), name: 'Projex', status: 'active' },
  { id: asCompanyId('co_acme'), name: 'Acme Co', status: 'active' },
  { id: asCompanyId('co_globex'), name: 'Globex', status: 'active' },
];
