import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function makeId(prefix) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

async function ensureAuthUser(pool, email) {
  const result = await pool.query(
    `select id, email, name from ba_user where lower(email) = lower($1) limit 1`,
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    throw new Error(
      `No BetterAuth user found for email "${email}". Run npm run auth:create-user first.`
    );
  }
  return user;
}

async function ensureAppUser(pool, authUser) {
  await pool.query(
    `insert into users (id, email, name, disabled, is_global_superadmin)
     values ($1, $2, $3, false, true)
     on conflict (id) do update
     set email = excluded.email,
         name = excluded.name,
         disabled = false,
         is_global_superadmin = true`,
    [authUser.id, authUser.email, authUser.name || authUser.email]
  );
}

async function ensureCompany(pool, userId, requestedId, requestedName) {
  if (!requestedId && !requestedName) return null;

  let company = null;
  if (requestedId) {
    company =
      (
        await pool.query(
          `select id, name from companies where id = $1 limit 1`,
          [requestedId]
        )
      ).rows[0] ?? null;
  }
  if (!company && requestedName) {
    company =
      (
        await pool.query(
          `select id, name
           from companies
           where lower(name) = lower($1)
           order by id asc
           limit 1`,
          [requestedName]
        )
      ).rows[0] ?? null;
  }
  if (!company) {
    company =
      (
        await pool.query(
          `insert into companies (id, name, status, deactivated_at)
           values ($1, $2, 'active', null)
           returning id, name`,
          [requestedId || makeId('co'), requestedName || requestedId]
        )
      ).rows[0] ?? null;
  }

  await pool.query(
    `insert into company_memberships (company_id, user_id, role)
     values ($1, $2, 'admin')
     on conflict (company_id, user_id) do update
     set role = excluded.role`,
    [company.id, userId]
  );

  return company;
}

async function ensureProject(
  pool,
  companyId,
  userId,
  requestedId,
  requestedName
) {
  if (!companyId || (!requestedId && !requestedName)) return null;

  let project = null;
  if (requestedId) {
    project =
      (
        await pool.query(
          `select id, name
           from projects
           where id = $1 and company_id = $2
           limit 1`,
          [requestedId, companyId]
        )
      ).rows[0] ?? null;
  }
  if (!project && requestedName) {
    project =
      (
        await pool.query(
          `select id, name
           from projects
           where company_id = $1 and lower(name) = lower($2)
           order by id asc
           limit 1`,
          [companyId, requestedName]
        )
      ).rows[0] ?? null;
  }
  if (!project) {
    project =
      (
        await pool.query(
          `insert into projects (
             id,
             company_id,
             name,
             budget_total_cents,
             currency,
             status,
             deactivated_at,
             visibility,
             allow_superadmin_access
           )
           values ($1, $2, $3, 0, 'AUD', 'active', null, 'private', true)
           returning id, name`,
          [
            requestedId || makeId('prj'),
            companyId,
            requestedName || requestedId,
          ]
        )
      ).rows[0] ?? null;
  }

  await pool.query(
    `insert into project_memberships (project_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (project_id, user_id) do update
     set role = excluded.role`,
    [project.id, userId]
  );

  return project;
}

async function run() {
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  try {
    const authUser = await ensureAuthUser(
      pool,
      requireEnv('PROJEX_AUTH_EMAIL')
    );
    await ensureAppUser(pool, authUser);

    const company = await ensureCompany(
      pool,
      authUser.id,
      optionalEnv('PROJEX_BOOTSTRAP_COMPANY_ID'),
      optionalEnv('PROJEX_BOOTSTRAP_COMPANY_NAME')
    );
    const project = await ensureProject(
      pool,
      company?.id ?? null,
      authUser.id,
      optionalEnv('PROJEX_BOOTSTRAP_PROJECT_ID'),
      optionalEnv('PROJEX_BOOTSTRAP_PROJECT_NAME')
    );

    const memberships = await pool.query(
      `select company_id, role
       from company_memberships
       where user_id = $1
       order by company_id asc`,
      [authUser.id]
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          linkedUserId: authUser.id,
          email: authUser.email,
          isGlobalSuperadmin: true,
          company: company ? { id: company.id, name: company.name } : null,
          project: project ? { id: project.id, name: project.name } : null,
          memberships: memberships.rows,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
