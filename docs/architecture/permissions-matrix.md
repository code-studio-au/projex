# Permissions Matrix

This document is the source of truth for the current role model used by `src/utils/auth.ts` and server-side authorization checks.

## Company roles

| Action                    | Admin | Executive | Management | Member |
| ------------------------- | ----- | --------- | ---------- | ------ |
| `company:view`            | Yes   | Yes       | Yes        | Yes    |
| `company:update_details`  | Yes   | Yes       | Yes        | No     |
| `company:manage_members`  | Yes   | No        | No         | No     |
| `company:manage_defaults` | Yes   | Yes       | No         | No     |
| `company:export`          | Yes   | Yes       | No         | No     |
| `project:create`          | Yes   | Yes       | No         | No     |

## Project roles

Company `admin` and `executive` users can view and edit all company projects. Project membership matters most for everyone else.

| Action                          | Owner                                   | Lead                                    | Member | Viewer |
| ------------------------------- | --------------------------------------- | --------------------------------------- | ------ | ------ |
| `project:list` / `project:view` | Yes                                     | Yes                                     | Yes    | Yes    |
| `project:edit`                  | Yes                                     | Yes                                     | No     | No     |
| `project:configure`             | No, unless also company admin/executive | No, unless also company admin/executive | No     | No     |
| `project:lifecycle`             | No, unless also company admin/executive | No, unless also company admin/executive | No     | No     |
| `project:import`                | Yes                                     | Yes                                     | No     | No     |
| `taxonomy:edit`                 | Yes                                     | Yes                                     | No     | No     |
| `budget:edit`                   | Yes                                     | Yes                                     | Yes    | No     |
| `txns:edit`                     | Yes                                     | Yes                                     | Yes    | No     |
| `txns:resolve_unlock`           | Yes                                     | Yes                                     | No     | No     |
| `txns:admin_unlock`             | No, unless also company admin/executive | No, unless also company admin/executive | No     | No     |
| `txns:manage_reversals`         | Yes                                     | Yes                                     | No     | No     |
| `comments:create`               | Yes                                     | Yes                                     | Yes    | No     |
| `comments:assign`               | Yes                                     | Yes                                     | No     | No     |
| `comments:resolve`              | Yes                                     | Yes                                     | No     | No     |
| `comments:moderate`             | Yes                                     | Yes                                     | No     | No     |

## Superadmin behavior

- Global superadmins are allowed everywhere by default.
- Project-scoped access still respects `projects.allow_superadmin_access`.
- If `allow_superadmin_access=false`, project-scoped reads and writes are blocked even for global superadmins.

## Access administration invariants

- `src/access/roleDefinitions.ts` is the client-facing explanation of this
  matrix. Role selectors show the resulting capabilities and require an
  explicit confirmation before changing access.
- A company must retain at least one Admin. The final Admin cannot be demoted
  or removed, and an administrator cannot remove their own company membership.
- A project must retain at least one Owner. Assigning an existing project
  member replaces that member's one persisted project role; it does not create
  a second role row. Owner and Lead currently have the same application
  permissions, but Owner records project accountability and preserves the
  administration invariant.
- Company membership removal also removes the user's explicit project
  memberships in that company. Company Admin and Executive access continues to
  override project membership as shown above.
- Company and project role changes lock their parent row and enforce the final
  Admin or Owner check in the same database transaction as the write. UI checks
  are explanatory safeguards, not the security boundary.
- After hydration, live permission data replaces the server-rendered permission
  snapshot. A user who removes their own project-settings access is navigated
  away and cannot retain stale controls from the original page load.

## Notes

- `company:update_details`, `company:manage_defaults`, `company:export`, and
  `project:create` remain separate capabilities rather than one broad
  `company:edit` bucket.
- Comment permissions were split so viewers cannot create comments, and only leads/owners or company admins/executives can assign, resolve, or moderate them.
- If the product model changes, update this file and the authorization tests together.
