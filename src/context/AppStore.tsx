import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  BudgetLine,
  Category,
  Company,
  CompanyMembership,
  CompanyRole,
  Id,
  Project,
  ProjectMembership,
  ProjectRole,
  SubCategory,
  Txn,
  User,
} from "../types";
import { seedBudgets, seedCategories, seedSubCategories, seedTransactions } from "../data/seedData";
import { uid } from "../utils/id";
import { PROJEX_STATE_KEY, seedState, type PersistedStateV1 } from "../seed";

export type ProjectDataSlice = {
  budgets: BudgetLine[];
  transactions: Txn[];
  categories: Category[];
  subCategories: SubCategory[];
};

type StoreState = {
  // auth (mock)
  appOwnerUserId: Id;
  currentUserId: Id;
  currentUser: User;
  setCurrentUserId: (id: Id) => void;
  isAppOwner: (userId: Id) => boolean;

  // tenants + access
  companies: Company[];
  projects: Project[];
  users: User[];
  companyMemberships: CompanyMembership[];
  projectMemberships: ProjectMembership[];

  // selection
  activeCompanyId: Id;
  activeProjectId: Id | null;
  setActiveCompanyId: (id: Id) => void;
  setActiveProjectId: (id: Id | null) => void;

  // project scoped data
  getProjectData: (projectId: Id) => ProjectDataSlice;
  setProjectData: (projectId: Id, patch: Partial<ProjectDataSlice>) => void;

  // superadmin CRUD
  addCompany: (name: string) => Id;
  removeCompany: (companyId: Id) => void;

  addProject: (companyId: Id, name: string) => Id;
  removeProject: (projectId: Id) => void;

  addUser: (name: string, email: string) => Id;
  removeUser: (userId: Id) => void;

  upsertCompanyMembership: (companyId: Id, userId: Id, role: CompanyRole) => void;
  removeCompanyMembership: (companyId: Id, userId: Id, role: CompanyRole) => void;

  upsertProjectMembership: (projectId: Id, userId: Id, role: ProjectRole) => void;
  removeProjectMembership: (projectId: Id, userId: Id, role: ProjectRole) => void;

  // helpers for login UI
  getPrimaryCompanyForUser: (userId: Id) => { companyId: Id; role: CompanyRole } | null;
  getUserCompanyId: (userId: Id) => Id | null;
  getUserCompanyRole: (userId: Id) => CompanyRole | null;
  getUserCompanyRoles: (userId: Id) => CompanyRole[];
  getUserProjectRoles: (projectId: Id, userId: Id) => ProjectRole[];
  getCompanyUserIds: (companyId: Id) => Id[];
  getCompanyUsers: (companyId: Id) => User[];
  addUserToCompany: (companyId: Id, name: string, email: string, role?: CompanyRole) => Id;

  // local state controls (super admin)
  clearLocalState: () => void;
  applySeedState: () => void;
};

const StoreCtx = createContext<StoreState | null>(null);

function stampSeedToProject(companyId: Id, projectId: Id): ProjectDataSlice {
  const categories: Category[] = seedCategories.map((c) => ({ ...c, companyId, projectId }));
  const subCategories: SubCategory[] = seedSubCategories.map((s) => ({ ...s, companyId, projectId }));
  const budgets: BudgetLine[] = seedBudgets.map((b) => ({ ...b, companyId, projectId }));
  const transactions: Txn[] = seedTransactions.map((t) => ({ ...t, companyId, projectId }));
  return { budgets, transactions, categories, subCategories };
}

const companyRoleRank: Record<CompanyRole, number> = {
  superadmin: 5,
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

export function AppStoreProvider(props: { children: React.ReactNode }) {
  // --- mock auth/users
  const appOwnerUserId: Id = "u_superadmin";

  const clearLocalState = () => {
    try {
      localStorage.removeItem(PROJEX_STATE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const applySeedState = () => {
    try {
      localStorage.setItem(PROJEX_STATE_KEY, JSON.stringify(seedState));
    } catch {
      // ignore
    }
    window.location.reload();
  };


  const loadState = (): PersistedStateV1 | null => {
    try {
      const raw = localStorage.getItem(PROJEX_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedStateV1;
      if (!parsed || !parsed.users || !parsed.companies || !parsed.projects) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveState = (state: PersistedStateV1) => {
    try {
      localStorage.setItem(PROJEX_STATE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  };

  const persisted = loadState();

  const [users, setUsers] = useState<User[]>(() => persisted?.users ?? [
    { id: appOwnerUserId, email: "owner@projex.app", name: "Super Admin" },
    { id: "u_exec", email: "exec@acme.co", name: "Ava Exec" },
    { id: "u_mgmt", email: "mgmt@acme.co", name: "Max Management" },
    { id: "u_lead", email: "lead@acme.co", name: "Priya Project Lead" },
    { id: "u_member", email: "member@acme.co", name: "Theo Team Member" },
    { id: "u_viewer", email: "viewer@globex.com", name: "Gina Viewer" },
  ]);

  const [companies, setCompanies] = useState<Company[]>(() => persisted?.companies ?? [
    { id: "co_projex", name: "Projex" },
    { id: "co_acme", name: "Acme Co" },
    { id: "co_globex", name: "Globex" },
  ]);

  const [projects, setProjects] = useState<Project[]>(() => persisted?.projects ?? [
    { id: "prj_acme_alpha", companyId: "co_acme", name: "Alpha", currency: "AUD", status: "active" },
    { id: "prj_acme_beta", companyId: "co_acme", name: "Beta", currency: "AUD", status: "active" },
    { id: "prj_globex_ops", companyId: "co_globex", name: "Ops Modernisation", currency: "AUD", status: "active" },
  ]);

  // memberships: allow multiple roles
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>(() => persisted?.companyMemberships ?? [
    { companyId: "co_projex", userId: appOwnerUserId, role: "superadmin" },

    { companyId: "co_acme", userId: "u_exec", role: "executive" },
    { companyId: "co_acme", userId: "u_mgmt", role: "management" },
    { companyId: "co_acme", userId: "u_lead", role: "member" },
    { companyId: "co_acme", userId: "u_member", role: "member" },

    { companyId: "co_globex", userId: "u_viewer", role: "member" },
  ]);

  const [projectMemberships, setProjectMemberships] = useState<ProjectMembership[]>(() => persisted?.projectMemberships ?? [
    { projectId: "prj_acme_alpha", userId: "u_lead", role: "lead" },
    { projectId: "prj_acme_alpha", userId: "u_member", role: "member" },
    { projectId: "prj_acme_beta", userId: "u_member", role: "lead" },
    { projectId: "prj_globex_ops", userId: "u_viewer", role: "viewer" },
  ]);

  // mock "session"
  const [currentUserId, setCurrentUserId] = useState<Id>(appOwnerUserId);

  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? users[0], [users, currentUserId]);

  const isAppOwner = (userId: Id) => userId === appOwnerUserId;

  // helper: for login label, pick the highest company role across memberships (or null)
  const getPrimaryCompanyForUser = (userId: Id) => {
    const ms = companyMemberships.filter((m) => m.userId === userId);
    if (!ms.length) return null;
    const sorted = [...ms].sort((a, b) => companyRoleRank[b.role] - companyRoleRank[a.role]);
    return { companyId: sorted[0].companyId, role: sorted[0].role };
  };

  // selection: default to primary company of current user (or first company)
  
  const getUserCompanyId = (userId: Id): Id | null => getPrimaryCompanyForUser(userId)?.companyId ?? null;
  const getUserCompanyRole = (userId: Id): CompanyRole | null => getPrimaryCompanyForUser(userId)?.role ?? null;

  const getUserCompanyRoles = (userId: Id): CompanyRole[] => {
    const cid = getUserCompanyId(userId);
    if (!cid) return [];
    return companyMemberships.filter((m) => m.userId === userId && m.companyId === cid).map((m) => m.role);
  };

  const getUserProjectRoles = (projectId: Id, userId: Id): ProjectRole[] =>
    projectMemberships.filter((m) => m.projectId === projectId && m.userId === userId).map((m) => m.role);


  const getCompanyUserIds = (companyId: Id): Id[] =>
    companyMemberships
      .filter((m) => m.companyId === companyId)
      .map((m) => m.userId);

  const getCompanyUsers = (companyId: Id): User[] => {
    const ids = new Set(getCompanyUserIds(companyId));
    return users.filter((u) => ids.has(u.id) && !u.disabled);
  };


const defaultCompanyId = useMemo(() => {
    return getPrimaryCompanyForUser(currentUserId)?.companyId ?? companies[0].id;
  }, [currentUserId, companies, companyMemberships]);

  const [activeCompanyId, setActiveCompanyId] = useState<Id>(defaultCompanyId);
  const [activeProjectId, setActiveProjectId] = useState<Id | null>(() => {
    const first = projects.find((p) => p.companyId === defaultCompanyId);
    return first ? first.id : null;
  });

  // If user changes, snap to their primary company
  const setCurrentUserIdAndSnap = (id: Id) => {
    setCurrentUserId(id);
    const primary = getUserCompanyId(id) ?? companies[0].id;
    setActiveCompanyId(primary);
    const first = projects.find((p) => p.companyId === primary);
    setActiveProjectId(first ? first.id : null);
  };

  // project data
  const [dataByProjectId, setDataByProjectId] = useState<Record<Id, ProjectDataSlice>>(() => {
    if (persisted?.dataByProjectId) return persisted.dataByProjectId as any;
    return seedState.dataByProjectId as any;
    const out: Record<Id, ProjectDataSlice> = {};
    for (const p of projects) {
      if (p.id === "prj_acme_alpha") out[p.id] = stampSeedToProject(p.companyId, p.id);
      else out[p.id] = { budgets: [], transactions: [], categories: [], subCategories: [] };
    }
    return out;
  });

  useEffect(() => {
    const payload: PersistedStateV1 = {
      users,
      companies,
      projects,
      companyMemberships,
      projectMemberships,
      dataByProjectId: dataByProjectId as any,
      activeCompanyId,
      activeProjectId,
    };
    saveState(payload);
  }, [users, companies, projects, companyMemberships, projectMemberships, dataByProjectId, activeCompanyId, activeProjectId]);

  const getProjectData = (projectId: Id): ProjectDataSlice =>
    dataByProjectId[projectId] ?? { budgets: [], transactions: [], categories: [], subCategories: [] };

  const setProjectData = (projectId: Id, patch: Partial<ProjectDataSlice>) => {
    setDataByProjectId((prev) => {
      const cur = prev[projectId] ?? { budgets: [], transactions: [], categories: [], subCategories: [] };
      return { ...prev, [projectId]: { ...cur, ...patch } };
    });
  };

  // CRUD
  const addCompany = (name: string) => {
    const id = `co_${uid()}`;
    setCompanies((prev) => [...prev, { id, name }]);
    return id;
  };

  const removeCompany = (companyId: Id) => {
    // remove projects + memberships + data
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    setCompanyMemberships((prev) => prev.filter((m) => m.companyId !== companyId));
    setProjects((prev) => prev.filter((p) => p.companyId !== companyId));
    setProjectMemberships((prev) => {
      const projIds = projects.filter((p) => p.companyId === companyId).map((p) => p.id);
      return prev.filter((m) => !projIds.includes(m.projectId));
    });
    setDataByProjectId((prev) => {
      const next = { ...prev };
      for (const p of projects.filter((p) => p.companyId === companyId)) delete next[p.id];
      return next;
    });

    if (activeCompanyId === companyId) {
      const fallback = companies.find((c) => c.id !== companyId)?.id ?? "co_acme";
      setActiveCompanyId(fallback);
      const first = projects.find((p) => p.companyId === fallback);
      setActiveProjectId(first ? first.id : null);
    }
  };

  const addProject = (companyId: Id, name: string) => {
    const id = `prj_${uid()}`;
    const p: Project = { id, companyId, name, currency: "AUD", status: "active" };
    setProjects((prev) => [...prev, p]);
    setDataByProjectId((prev) => ({ ...prev, [id]: { budgets: [], transactions: [], categories: [], subCategories: [] } }));
    return id;
  };

  const removeProject = (projectId: Id) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "archived" } : p)));
  };

  const addUser = (name: string, email: string) => {
    const id = `u_${uid()}`;
    setUsers((prev) => [...prev, { id, name, email }]);
    return id;
  };

  const addUserToCompany = (companyId: Id, name: string, email: string, role: CompanyRole = "member") => {
    const userId = addUser(name, email);
    // single-company rule: the user gets exactly one company membership
    setCompanyMemberships((prev) => [...prev.filter((m) => m.userId !== userId), { companyId, userId, role }]);
    return userId;
  };

  const removeUser = (userId: Id) => {
    if (userId === appOwnerUserId) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setCompanyMemberships((prev) => prev.filter((m) => m.userId !== userId));
    setProjectMemberships((prev) => prev.filter((m) => m.userId !== userId));
    if (currentUserId === userId) setCurrentUserIdAndSnap(appOwnerUserId);
  };

  const upsertCompanyMembership = (companyId: Id, userId: Id, role: CompanyRole) => {
    // Single-company per user, but allow MULTIPLE roles within that company.
    setCompanyMemberships((prev) => {
      // remove memberships for other companies
      const kept = prev.filter((m) => m.userId !== userId || m.companyId === companyId);
      const exists = kept.some((m) => m.companyId === companyId && m.userId === userId && m.role === role);
      if (exists) return kept;
      return [...kept, { companyId, userId, role }];
    });
  };

  const removeCompanyMembership = (companyId: Id, userId: Id, role: CompanyRole) => {
    setCompanyMemberships((prev) => prev.filter((m) => !(m.companyId === companyId && m.userId === userId && m.role === role)));
  };

  const upsertProjectMembership = (projectId: Id, userId: Id, role: ProjectRole) => {
    setProjectMemberships((prev) => {
      const exists = prev.some((m) => m.projectId === projectId && m.userId === userId && m.role === role);
      if (exists) return prev;
      return [...prev, { projectId, userId, role }];
    });
  };

  const removeProjectMembership = (projectId: Id, userId: Id, role: ProjectRole) => {
    setProjectMemberships((prev) => {
      if (role === "owner") {
        const owners = prev.filter((m) => m.projectId === projectId && m.role === "owner");
        if (owners.length <= 1 && owners.some((m) => m.userId === userId)) {
          console.warn("Refusing to remove last owner for project", projectId);
          return prev;
        }
      }
      return prev.filter((m) => !(m.projectId === projectId && m.userId === userId && m.role === role));
    });
  };

  const value: StoreState = {
    appOwnerUserId,
    currentUserId,
    currentUser,
    setCurrentUserId: setCurrentUserIdAndSnap,
    isAppOwner,

    companies,
    projects,
    users,
    companyMemberships,
    projectMemberships,

    activeCompanyId,
    activeProjectId,
    clearLocalState,
    applySeedState,

    setActiveCompanyId: (id) => {
      setActiveCompanyId(id);
      const first = projects.find((x) => x.companyId === id);
      setActiveProjectId(first ? first.id : null);
    },
    setActiveProjectId,

    getProjectData,
    setProjectData,

    addCompany,
    removeCompany,
    addProject,
    removeProject,
    addUser,
    removeUser,
    upsertCompanyMembership,
    removeCompanyMembership,
    upsertProjectMembership,
    removeProjectMembership,
    getPrimaryCompanyForUser,
    getUserCompanyId,
    getUserCompanyRole,
    getUserCompanyRoles,
    getUserProjectRoles,
    getCompanyUserIds,
    getCompanyUsers,
    addUserToCompany,
  };

  return <StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider>;
}

export function useAppStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useAppStore must be used inside AppStoreProvider");
  return ctx;
}
