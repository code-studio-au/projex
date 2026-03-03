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
