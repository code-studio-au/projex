import { buildSeedState } from '../../seed/index.ts';
import { getDb } from './db.ts';

/**
 * Fully resets app-domain tables and repopulates them from seed data.
 * This does not touch BetterAuth tables.
 */
export async function seedDatabaseToBaseline(): Promise<void> {
  const db = getDb();
  const seed = buildSeedState();

  await db.transaction().execute(async (trx) => {
    const now = new Date().toISOString();

    // Clear app-domain data in dependency-safe order.
    await trx.deleteFrom('txns').execute();
    await trx.deleteFrom('budget_lines').execute();
    await trx.deleteFrom('sub_categories').execute();
    await trx.deleteFrom('categories').execute();
    await trx.deleteFrom('company_default_sub_categories').execute();
    await trx.deleteFrom('company_default_categories').execute();
    await trx.deleteFrom('email_change_requests').execute();
    await trx.deleteFrom('project_memberships').execute();
    await trx.deleteFrom('company_memberships').execute();
    await trx.deleteFrom('projects').execute();
    await trx.deleteFrom('users').execute();
    await trx.deleteFrom('companies').execute();

    await trx
      .insertInto('companies')
      .values(
        seed.companies.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          deactivated_at: c.deactivatedAt ?? null,
        }))
      )
      .execute();

    await trx
      .insertInto('users')
      .values(
        seed.users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          disabled: !!u.disabled,
        }))
      )
      .execute();

    await trx
      .insertInto('projects')
      .values(
        seed.projects.map((p) => ({
          id: p.id,
          company_id: p.companyId,
          name: p.name,
          budget_total_cents: p.budgetTotalCents,
          currency: p.currency,
          status: p.status,
          deactivated_at: p.deactivatedAt ?? null,
          visibility: p.visibility,
          allow_superadmin_access: p.allowSuperadminAccess,
        }))
      )
      .execute();

    await trx
      .insertInto('company_memberships')
      .values(
        seed.companyMemberships.map((m) => ({
          company_id: m.companyId,
          user_id: m.userId,
          role: m.role,
        }))
      )
      .execute();

    await trx
      .insertInto('project_memberships')
      .values(
        seed.projectMemberships.map((m) => ({
          project_id: m.projectId,
          user_id: m.userId,
          role: m.role,
        }))
      )
      .execute();

    for (const companyId of Object.keys(seed.companyDefaultsByCompanyId) as Array<
      keyof typeof seed.companyDefaultsByCompanyId
    >) {
      const slice = seed.companyDefaultsByCompanyId[companyId];
      if (!slice) continue;

      if (slice.categories.length) {
        await trx
          .insertInto('company_default_categories')
          .values(
            slice.categories.map((c) => ({
              id: c.id,
              company_id: c.companyId,
              name: c.name,
              created_at: c.createdAt ?? now,
              updated_at: c.updatedAt ?? now,
            }))
          )
          .execute();
      }

      if (slice.subCategories.length) {
        await trx
          .insertInto('company_default_sub_categories')
          .values(
            slice.subCategories.map((s) => ({
              id: s.id,
              company_id: s.companyId,
              company_default_category_id: s.companyDefaultCategoryId,
              name: s.name,
              created_at: s.createdAt ?? now,
              updated_at: s.updatedAt ?? now,
            }))
          )
          .execute();
      }
    }

    const projectIds = Object.keys(seed.dataByProjectId) as Array<keyof typeof seed.dataByProjectId>;
    for (const projectId of projectIds) {
      const slice = seed.dataByProjectId[projectId];
      if (!slice) continue;

      if (slice.categories.length) {
        await trx
          .insertInto('categories')
          .values(
            slice.categories.map((c) => ({
              id: c.id,
              company_id: c.companyId,
              project_id: c.projectId,
              name: c.name,
              created_at: c.createdAt ?? now,
              updated_at: c.updatedAt ?? now,
            }))
          )
          .execute();
      }

      if (slice.subCategories.length) {
        await trx
          .insertInto('sub_categories')
          .values(
            slice.subCategories.map((s) => ({
              id: s.id,
              company_id: s.companyId,
              project_id: s.projectId,
              category_id: s.categoryId,
              name: s.name,
              created_at: s.createdAt ?? now,
              updated_at: s.updatedAt ?? now,
            }))
          )
          .execute();
      }

      if (slice.budgets.length) {
        await trx
          .insertInto('budget_lines')
          .values(
            slice.budgets.map((b) => ({
              id: b.id,
              company_id: b.companyId,
              project_id: b.projectId,
              category_id: b.categoryId ?? null,
              sub_category_id: b.subCategoryId ?? null,
              allocated_cents: b.allocatedCents,
              created_at: b.createdAt ?? now,
              updated_at: b.updatedAt ?? now,
            }))
          )
          .execute();
      }

      if (slice.transactions.length) {
        await trx
          .insertInto('txns')
          .values(
            slice.transactions.map((t) => ({
              public_id: t.id,
              external_id: t.externalId ?? null,
              company_id: t.companyId,
              project_id: t.projectId,
              txn_date: t.date,
              item: t.item,
              description: t.description,
              amount_cents: t.amountCents,
              category_id: t.categoryId ?? null,
              sub_category_id: t.subCategoryId ?? null,
              created_at: t.createdAt ?? now,
              updated_at: t.updatedAt ?? now,
            }))
          )
          .execute();
      }
    }
  });
}
