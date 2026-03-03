# Server Transition Map

This map is the migration checklist from `LocalApi` commands to TanStack Start server functions + Postgres tables.

## Session/Auth

| LocalApi command | Server function target | DB tables | Notes |
|---|---|---|---|
| `getSession` | `getSessionServer` | n/a | Read Better Auth session only |
| `loginAs` (dev only) | `/api/dev/session` | `users` | Enabled only with `PROJEX_ENABLE_DEV_ENDPOINTS=true` and non-production |
| `logout` | Better Auth logout handler + dev-cookie clear | n/a | Server route clears dev session cookie for local server-mode |

Production auth integration options:

1. `BETTER_AUTH_SESSION_URL` (HTTP session endpoint), or
2. `BETTER_AUTH_DIRECT_SESSION_FN` (`modulePath#exportName`) direct resolver hook.

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

## Start Wiring (Server-only)

Use the server bridge + Start server API to keep route files minimal:

- Bridge: `src/server/api/startBridge.ts`
- API adapter: `src/server/api/startServerApi.ts`
- API routes: `src/routes/api.*.ts`

Example route/server-function shape:

```ts
import { withApi } from '@/routes/-api-shared';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/companies')({
  server: {
    handlers: {
      GET: ({ request }) => withApi(request, (api) => api.listCompanies()),
    },
  },
})
```

Rules:

1. Keep `src/api/server/serverApi.ts` client-safe (no DB/Node imports).
2. Route files should call `withApi()` and never import DB modules directly.
3. Pass `request` through bridge so session comes from Better Auth.
4. Keep `/api/dev/*` endpoints disabled in production.
