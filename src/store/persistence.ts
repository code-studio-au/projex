import type { CompanyId, ProjectId } from "../types";
import { seedState, PROJEX_STATE_KEY, type PersistedStateV1 } from "../seed";

/**
 * Local persistence for the demo app.
 * Keep these helpers pure-ish and isolated so AppStore doesn't become a god object.
 */

export function clearPersistedState() {
  try {
    localStorage.removeItem(PROJEX_STATE_KEY);
  } catch {
    // ignore
  }
}

export function applySeedToPersistence() {
  try {
    localStorage.setItem(PROJEX_STATE_KEY, JSON.stringify(seedState));
  } catch {
    // ignore
  }
}

export function loadPersistedState(): PersistedStateV1 | null {
  try {
    const raw = localStorage.getItem(PROJEX_STATE_KEY);
    if (!raw) return null;

    const parsedUnknown = JSON.parse(raw) as unknown;
    if (!parsedUnknown || typeof parsedUnknown !== "object") return null;

    const parsed = parsedUnknown as Partial<PersistedStateV1>;

    // Basic shape checks (avoid bricking the app on corrupt localStorage)
    const users = Array.isArray(parsed.users) ? parsed.users : null;
    const companies = Array.isArray(parsed.companies) ? parsed.companies : null;
    const projects = Array.isArray(parsed.projects) ? parsed.projects : null;
    const companyMemberships = Array.isArray(parsed.companyMemberships) ? parsed.companyMemberships : null;
    const projectMemberships = Array.isArray(parsed.projectMemberships) ? parsed.projectMemberships : null;
    const dataByProjectId =
      parsed.dataByProjectId && typeof parsed.dataByProjectId === "object"
        ? (parsed.dataByProjectId as PersistedStateV1["dataByProjectId"])
        : null;

    if (!users || !companies || !projects || !companyMemberships || !projectMemberships || !dataByProjectId) return null;

    const companyId = (parsed.activeCompanyId as CompanyId) ?? seedState.activeCompanyId;
    const companyExists = companies.some((c) => c.id === companyId);
    const safeCompanyId = companyExists ? companyId : seedState.activeCompanyId;

    const projectId = (parsed.activeProjectId as ProjectId | null) ?? null;
    const projectExists = projectId ? projects.some((p) => p.id === projectId && p.companyId === safeCompanyId) : false;
    const safeProjectId = projectExists ? projectId : null;

    return {
      users,
      companies,
      projects,
      companyMemberships,
      projectMemberships,
      dataByProjectId,
      activeCompanyId: safeCompanyId,
      activeProjectId: safeProjectId,
    };
  } catch {
    return null;
  }
}

export function savePersistedState(state: PersistedStateV1) {
  try {
    localStorage.setItem(PROJEX_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
