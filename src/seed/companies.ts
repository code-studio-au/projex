import type { Company } from '../types';
import { asCompanyId } from '../types';

export const seedCompanies: Company[] = [
  { id: asCompanyId('co_projex'), name: 'Projex' },
  { id: asCompanyId('co_acme'), name: 'Acme Co' },
  { id: asCompanyId('co_globex'), name: 'Globex' },
];
