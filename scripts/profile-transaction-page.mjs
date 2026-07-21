import { Pool } from 'pg';

import {
  runProjexMigrations,
  startDisposablePostgres,
} from './disposable-postgres.mjs';

const DATABASE_NAME = 'projex_transaction_profile';
const PROJECT_SIZES = [1_000, 10_000, 100_000];
const PROFILE_USER_ID = 'usr_transaction_profile';

const pageSql = `
  select t.*, tr.id as reversal_id, tr.status as reversal_status
  from txns t
  left join txn_reversals tr
    on tr.project_id = t.project_id
   and (
     tr.source_txn_public_id = t.public_id
     or tr.matched_reversal_txn_public_id = t.public_id
   )
  where t.project_id = $1
  order by t.txn_date desc, t.id desc
  limit 20 offset 0
`;

const summarySql = `
  select
    count(*) as total_count,
    coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0) as budget_impact_cents,
    coalesce(sum(case when exists (
      select 1 from txn_reversals tr
      where tr.project_id = t.project_id
        and tr.source_txn_public_id = t.public_id
        and tr.status in (
          'pending_reversal',
          'auto_matched_pending_approval',
          'auto_matched_ambiguous_pending_approval',
          'reversal_exception'
        )
    ) then 1 else 0 end), 0) as pending_reversal_count,
    coalesce(sum(case when exists (
      select 1 from txn_reversals tr
      where tr.project_id = t.project_id
        and tr.source_txn_public_id = t.public_id
        and tr.status in (
          'pending_reversal',
          'auto_matched_pending_approval',
          'auto_matched_ambiguous_pending_approval',
          'reversal_exception'
        )
    ) then t.amount_cents else 0 end), 0) as pending_reversal_cents,
    coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0)
      - coalesce(sum(case when exists (
        select 1 from txn_reversals tr
        where tr.project_id = t.project_id
          and tr.source_txn_public_id = t.public_id
          and tr.status in (
            'pending_reversal',
            'auto_matched_pending_approval',
            'auto_matched_ambiguous_pending_approval',
            'reversal_exception'
          )
      ) then t.amount_cents else 0 end), 0) as adjusted_budget_impact_cents,
    coalesce(sum(case when t.categorisable and (
      t.sub_category_id is null or not exists (
        select 1 from sub_categories sc
        where sc.id = t.sub_category_id
          and sc.project_id = t.project_id
      )
    ) then 1 else 0 end), 0) as uncoded_count,
    coalesce(sum(case when t.budget_impact and t.categorisable and (
      t.sub_category_id is null or not exists (
        select 1 from sub_categories sc
        where sc.id = t.sub_category_id
          and sc.project_id = t.project_id
      )
    ) then t.amount_cents else 0 end), 0) as uncoded_cents,
    coalesce(sum(case when exists (
      select 1 from txn_comments tc
      where tc.project_id = t.project_id
        and tc.txn_public_id = t.public_id
        and tc.assigned_to_user_id = $2
        and tc.resolved_at is null
    ) then 1 else 0 end), 0) as assigned_to_me_count
  from txns t
  where t.project_id = $1
`;

const joinedSummarySql = `
  select
    count(*) as total_count,
    coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0) as budget_impact_cents,
    coalesce(sum(case when ptr.id is not null then 1 else 0 end), 0) as pending_reversal_count,
    coalesce(sum(case when ptr.id is not null then t.amount_cents else 0 end), 0) as pending_reversal_cents,
    coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0)
      - coalesce(sum(case when ptr.id is not null then t.amount_cents else 0 end), 0) as adjusted_budget_impact_cents,
    coalesce(sum(case when t.categorisable and (
      t.sub_category_id is null or sc.id is null
    ) then 1 else 0 end), 0) as uncoded_count,
    coalesce(sum(case when t.budget_impact and t.categorisable and (
      t.sub_category_id is null or sc.id is null
    ) then t.amount_cents else 0 end), 0) as uncoded_cents,
    coalesce(sum(case when exists (
      select 1 from txn_comments tc
      where tc.project_id = t.project_id
        and tc.txn_public_id = t.public_id
        and tc.assigned_to_user_id = $2
        and tc.resolved_at is null
    ) then 1 else 0 end), 0) as assigned_to_me_count
  from txns t
  left join sub_categories sc
    on sc.project_id = t.project_id
   and sc.id = t.sub_category_id
  left join txn_reversals ptr
    on ptr.project_id = t.project_id
   and ptr.source_txn_public_id = t.public_id
   and ptr.status in (
     'pending_reversal',
     'auto_matched_pending_approval',
     'auto_matched_ambiguous_pending_approval',
     'reversal_exception'
   )
  where t.project_id = $1
`;

function collectNodeNames(node, names = []) {
  const index = node['Index Name'] ? ` ${node['Index Name']}` : '';
  names.push(`${node['Node Type']}${index}`);
  for (const child of node.Plans ?? []) collectNodeNames(child, names);
  return names;
}

async function explain(pool, query, params) {
  await pool.query(`explain (analyze, buffers, format json) ${query}`, params);
  const result = await pool.query(
    `explain (analyze, buffers, format json) ${query}`,
    params
  );
  const document = result.rows[0]['QUERY PLAN'][0];
  return {
    executionMs: document['Execution Time'],
    planningMs: document['Planning Time'],
    plan: collectNodeNames(document.Plan).join(' > '),
  };
}

async function seed(pool) {
  await pool.query(`
    insert into companies (id, name, status)
    values ('co_transaction_profile', 'Transaction profile', 'active');

    insert into users (id, email, name)
    values ('${PROFILE_USER_ID}', 'transaction-profile@example.invalid', 'Profile user');
  `);

  for (const rowCount of PROJECT_SIZES) {
    const projectId = `prj_profile_${rowCount}`;
    const categoryId = `cat_profile_${rowCount}`;
    const subCategoryId = `sub_profile_${rowCount}`;
    await pool.query(
      `insert into projects (
        id, company_id, name, currency, status, visibility
      ) values ($1, 'co_transaction_profile', $2, 'AUD', 'active', 'private')`,
      [projectId, `Profile ${rowCount}`]
    );
    await pool.query(
      `insert into categories (id, company_id, project_id, name)
       values ($1, 'co_transaction_profile', $2, 'Profile category')`,
      [categoryId, projectId]
    );
    await pool.query(
      `insert into sub_categories (
        id, company_id, project_id, category_id, name
      ) values ($1, 'co_transaction_profile', $2, $3, 'Profile subcategory')`,
      [subCategoryId, projectId, categoryId]
    );
    await pool.query(
      `insert into txns (
          public_id,
          company_id,
          project_id,
          txn_date,
          item,
          description,
          amount_cents,
          category_id,
          sub_category_id,
          coding_source,
          coding_pending_approval,
          reviewed_at,
          reviewed_by_user_id
      )
      select
          $1 || '_txn_' || series,
          'co_transaction_profile',
          $1,
          date '2023-01-01' + ((series - 1) % 1095)::integer,
          'Profile item ' || series,
          'Representative imported transaction ' || series,
          100 + (series % 100000),
          case when series % 5 = 0 then null else $2 end,
          case when series % 5 = 0 then null else $3 end,
          case when series % 5 = 0 then null else 'manual' end,
          series % 13 = 0,
          case when series % 7 = 0 then now() else null end,
          case when series % 7 = 0 then '${PROFILE_USER_ID}' else null end
      from generate_series(1, $4::integer) as series`,
      [projectId, categoryId, subCategoryId, rowCount]
    );
  }

  await pool.query('analyze');
}

async function profilePhase(pool, phase, summaryQuery = summarySql) {
  const rows = [];
  for (const rowCount of PROJECT_SIZES) {
    const projectId = `prj_profile_${rowCount}`;
    const page = await explain(pool, pageSql, [projectId]);
    const summary = await explain(pool, summaryQuery, [
      projectId,
      PROFILE_USER_ID,
    ]);
    rows.push({ phase, rowCount, page, summary });
  }
  return rows;
}

function printResults(results) {
  console.info(
    '| Phase | Project rows | Page query ms | Summary query ms | Page root plan |'
  );
  console.info('| --- | ---: | ---: | ---: | --- |');
  for (const result of results) {
    console.info(
      `| ${result.phase} | ${result.rowCount.toLocaleString('en-AU')} | ${result.page.executionMs.toFixed(3)} | ${result.summary.executionMs.toFixed(3)} | ${result.page.plan} |`
    );
  }
}

async function main() {
  const postgres = await startDisposablePostgres({
    containerPrefix: 'projex-transaction-profile',
  });
  const connectionString = postgres.connectionString(DATABASE_NAME);
  let pool;

  try {
    await postgres.createDatabase(DATABASE_NAME);
    await runProjexMigrations({ connectionString });
    pool = new Pool({ connectionString, max: 2 });
    await seed(pool);

    const baseline = await profilePhase(pool, 'Baseline');
    await pool.query(`
      create index idx_txns_project_date_id_profile
        on txns(project_id, txn_date desc, id desc)
    `);
    await pool.query('analyze txns');
    const indexed = await profilePhase(pool, 'Project/date/id index');
    const optimized = await profilePhase(
      pool,
      'Index + joined summary',
      joinedSummarySql
    );

    printResults([...baseline, ...indexed, ...optimized]);
    console.info('\nDetailed page plans:');
    for (const result of [...baseline, ...indexed, ...optimized]) {
      console.info(
        `- ${result.phase}, ${result.rowCount.toLocaleString('en-AU')} rows: ${result.page.plan}`
      );
    }
  } finally {
    await pool?.end();
    await postgres.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
