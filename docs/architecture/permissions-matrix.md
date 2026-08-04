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

## Notes

- `company:update_details`, `company:manage_defaults`, `company:export`, and
  `project:create` remain separate capabilities rather than one broad
  `company:edit` bucket.
- Comment permissions were split so viewers cannot create comments, and only leads/owners or company admins/executives can assign, resolve, or moderate them.
- If the product model changes, update this file and the authorization tests together.
