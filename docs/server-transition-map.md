# Server Transition Map

This map is the migration checklist from `LocalApi` commands to TanStack Start server functions + Postgres tables.

## Session/Auth

| LocalApi command | Server function target | DB tables | Notes |
|---|---|---|---|
| `getSession` | `getSessionServer` | n/a | Read Better Auth session only |
| `loginAs` (local only) | n/a | n/a | Removed in prod (Better Auth handles login) |
| `logout` | Better Auth logout handler | n/a | No local emulation in server adapter |

## Reference

| LocalApi command | Server function target | DB tables | Notes |
|---|---|---|---|
| `listCompanies` | `listCompaniesServer` | `companies`, `company_memberships` | Superadmin sees all; others membership-scoped |
| `listProjects` | `listProjectsServer` | `projects`, `company_memberships`, `project_memberships` | Visibility + membership checks |
| `getCompany` / `getProject` | `getCompanyServer` / `getProjectServer` | `companies`, `projects` + memberships | Must enforce archived/deactivated rules |

## Memberships/RBAC

| LocalApi command | Server function target | DB tables | Notes |
|---|---|---|---|
| `listCompanyMemberships` | `listCompanyMembershipsServer` | `company_memberships` | Scoped by `company:view` |
| `listAllCompanyMemberships` | `listAllCompanyMembershipsServer` | `company_memberships` | Superadmin all, others scoped |
| `upsert/deleteCompanyMembership` | command server fns | `company_memberships` | PK `(company_id,user_id)` |
| `upsert/deleteProjectMembership` | command server fns | `project_memberships` | PK `(project_id,user_id)` |

## Taxonomy

| LocalApi command | Server function target | DB tables | Constraints |
|---|---|---|---|
| `create/update/deleteCategory` | taxonomy command fns | `categories` | `uq_categories_project_lower_name` |
| `create/update/deleteSubCategory` | taxonomy command fns | `sub_categories` | `uq_sub_categories_project_category_lower_name` |

## Budget

| LocalApi command | Server function target | DB tables | Constraints |
|---|---|---|---|
| `listBudgets` | `listBudgetsServer` | `budget_lines` | scoped by `project:view` |
| `create/update/deleteBudget` | budget command fns | `budget_lines` | unique `(project_id, sub_category_id)` when subcategory present |

## Transactions

| LocalApi command | Server function target | DB tables | Constraints |
|---|---|---|---|
| `listTransactions` | `listTransactionsServer` | `txns` | scoped by `project:view` |
| `create/update/deleteTxn` | txn command fns | `txns` | `public_id` unique per project |
| `importTransactions` | `importTransactionsServer` | `txns` (+ taxonomy/budget optional) | `external_id` unique per project when non-null |

## Lifecycle

| LocalApi command | Server function target | DB tables | Notes |
|---|---|---|---|
| `deactivate/reactivate/deleteCompany` | company lifecycle fns | `companies`, `projects`, memberships | keep policy parity with local |
| `deactivate/reactivate/deleteProject` | project lifecycle fns | `projects`, memberships | enforce status transition preconditions |

## Migration order

1. Apply SQL migrations (`npm run db:migrate`).
2. Implement server fn auth/session extraction with `toServerSession` + `requireAuthorized`.
3. Migrate read commands (list/get) first.
4. Migrate mutation commands with invariant parity.
5. Switch adapter mode from local to server per route surface.
