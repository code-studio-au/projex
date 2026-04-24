import { Pool } from 'pg';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function run() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const email = requireEnv('PROJEX_AUTH_EMAIL');
  const templateUserId = process.env.PROJEX_APP_TEMPLATE_USER_ID?.trim() || null;
  const bootstrapCompanyName = process.env.PROJEX_BOOTSTRAP_COMPANY_NAME?.trim() || null;
  const bootstrapCompanyId = process.env.PROJEX_BOOTSTRAP_COMPANY_ID?.trim() || null;
  const bootstrapProjectName = process.env.PROJEX_BOOTSTRAP_PROJECT_NAME?.trim() || null;
  const bootstrapProjectId = process.env.PROJEX_BOOTSTRAP_PROJECT_ID?.trim() || null;

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const authUser = await pool.query(
      `select id, email, name from ba_user where lower(email) = lower($1) limit 1`,
      [email]
    );
    if (!authUser.rows[0]) {
      throw new Error(
        `No BetterAuth user found for email "${email}". Run auth user creation/sign-up first.`
      );
    }
    const { id: userId, name, email: normalizedEmail } = authUser.rows[0];

    await pool.query(
      `insert into users (id, email, name, disabled)
       values ($1, $2, $3, false)
       on conflict (id) do update
       set email = excluded.email, name = excluded.name`,
      [userId, normalizedEmail, name || normalizedEmail]
    );

    let copiedCompanyMemberships = 0;
    let copiedProjectMemberships = 0;
    let bootstrapCompany = null;
    let bootstrapProject = null;

    if (templateUserId) {
      const templateCompanies = await pool.query(
        `select count(*)::int as count
         from company_memberships
         where user_id = $1`,
        [templateUserId]
      );
      const templateCompanyCount = templateCompanies.rows[0]?.count ?? 0;
      if (templateCompanyCount === 0) {
        throw new Error(
          `Template user "${templateUserId}" has no company memberships to copy. ` +
            'Run seed reset first (dev) or choose a template user that has memberships.'
        );
      }

      const companyRes = await pool.query(
        `insert into company_memberships (company_id, user_id, role)
         select company_id, $1, role
         from company_memberships
         where user_id = $2
         on conflict (company_id, user_id) do update
         set role = excluded.role`,
        [userId, templateUserId]
      );
      copiedCompanyMemberships = companyRes.rowCount ?? 0;

      const projectRes = await pool.query(
        `insert into project_memberships (project_id, user_id, role)
         select project_id, $1, role
         from project_memberships
         where user_id = $2
         on conflict (project_id, user_id) do update
         set role = excluded.role`,
        [userId, templateUserId]
      );
      copiedProjectMemberships = projectRes.rowCount ?? 0;
    } else if (bootstrapCompanyName || bootstrapCompanyId) {
      const makeId = (prefix) => `${prefix}_${Math.random().toString(16).slice(2, 14)}`;

      let company =
        bootstrapCompanyId
          ? (
              await pool.query(
                `select id, name from companies where id = $1 limit 1`,
                [bootstrapCompanyId]
              )
            ).rows[0] ?? null
          : null;

      if (!company && bootstrapCompanyName) {
        company =
          (
            await pool.query(
              `select id, name
               from companies
               where lower(name) = lower($1)
               order by id asc
               limit 1`,
              [bootstrapCompanyName]
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
              [bootstrapCompanyId || makeId('co'), bootstrapCompanyName || bootstrapCompanyId]
            )
          ).rows[0] ?? null;
      }

      await pool.query(
        `insert into company_memberships (company_id, user_id, role)
         values ($1, $2, 'superadmin')
         on conflict (company_id, user_id) do update
         set role = excluded.role`,
        [company.id, userId]
      );
      copiedCompanyMemberships = 1;
      bootstrapCompany = company;

      if (bootstrapProjectName || bootstrapProjectId) {
        let project =
          bootstrapProjectId
            ? (
                await pool.query(
                  `select id, name
                   from projects
                   where id = $1 and company_id = $2
                   limit 1`,
                  [bootstrapProjectId, company.id]
                )
              ).rows[0] ?? null
            : null;

        if (!project && bootstrapProjectName) {
          project =
            (
              await pool.query(
                `select id, name
                 from projects
                 where company_id = $1 and lower(name) = lower($2)
                 order by id asc
                 limit 1`,
                [company.id, bootstrapProjectName]
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
                [bootstrapProjectId || makeId('prj'), company.id, bootstrapProjectName || bootstrapProjectId]
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
        copiedProjectMemberships = 1;
        bootstrapProject = project;
      }
    }

    const finalCompanies = await pool.query(
      `select count(*)::int as count
       from company_memberships
       where user_id = $1`,
      [userId]
    );
    const finalCompanyCount = finalCompanies.rows[0]?.count ?? 0;
    if (finalCompanyCount === 0) {
      throw new Error(
        `Linked user "${userId}" has zero company memberships after link step.`
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          linkedUserId: userId,
          email: normalizedEmail,
          templateUserId,
          bootstrapCompany,
          bootstrapProject,
          copiedCompanyMemberships,
          copiedProjectMemberships,
          finalCompanyMemberships: finalCompanyCount,
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
