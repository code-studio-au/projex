alter table projects
  add column if not exists project_type text not null default 'project',
  add column if not exists parent_project_id text null references projects(id) on delete set null;

alter table projects
  drop constraint if exists projects_project_type_check;

alter table projects
  add constraint projects_project_type_check
  check (project_type in ('project', 'programme'));

alter table projects
  drop constraint if exists projects_parent_not_self_check;

alter table projects
  add constraint projects_parent_not_self_check
  check (parent_project_id is null or parent_project_id <> id);

create index if not exists idx_projects_parent_project
  on projects(parent_project_id);
