create table if not exists company_default_categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_company_default_categories_company_lower_name
  on company_default_categories(company_id, lower(name));

create table if not exists company_default_sub_categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  company_default_category_id text not null references company_default_categories(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_company_default_sub_categories_company_category_lower_name
  on company_default_sub_categories(company_id, company_default_category_id, lower(name));
