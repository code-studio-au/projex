import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  BudgetLine,
  Category,
  Company,
  CompanyMembership,
  CompanyRole,
  Project,
  ProjectMembership,
  ProjectRole,
  SubCategory,
  Txn,
  User,
} from "../types";
import type { CompanyId, ProjectId, UserId } from "../types";
import { asCompanyId, asProjectId, asUserId } from "../types";
import { uid } from "../utils/id";
import { seedState, type PersistedStateV1 } from "../seed";
import { applySeedToPersistence, clearPersistedState, loadPersistedState, savePersistedState } from "../store/persistence";
import { getPrimaryCompanyForUser as getPrimaryCompanyForUserFn } from "../store/access";

export type ProjectDataSlice = {
  budgets: BudgetLine[];
  transactions: Txn[];
  categories: Category[];
  subCategories: SubCategory[];
};

type StoreState = {
  // auth (mock)
  appOwnerUserId: UserId;
  currentUserId: UserId;
  currentUser: User;
  setCurrentUserId: (id: UserId) => void;
  isAppOwner: (userId: UserId) => boolean;

  // tenants + access
  companies: Company[];
  projects: Project[];
  users: User[];
  companyMemberships: CompanyMembership[];
  projectMemberships: ProjectMembership[];

  // selection
  activeCompanyId: CompanyId;
  activeProjectId: ProjectId | null;
  setActiveCompanyId: (id: CompanyId) => void;
  setActiveProjectId: (id: ProjectId | null) => void;

  // project scoped data
  getProjectData: (projectId: ProjectId) => ProjectDataSlice;
  setProjectData: (projectId: ProjectId, patch: Partial<ProjectDataSlice>) => void;

  // superadmin CRUD
  addCompany: (name: string) => CompanyId;
  removeCompany: (companyId: CompanyId) => void;

  addProject: (companyId: CompanyId, name: string) => ProjectId;
  removeProject: (projectId: ProjectId) => void;

  addUser: (name: string, email: string) => UserId;
  removeUser: (userId: UserId) => void;

  upsertCompanyMembership: (companyId: CompanyId, userId: UserId, role: CompanyRole) => void;
  removeCompanyMembership: (companyId: CompanyId, userId: UserId, role: CompanyRole) => void;

  upsertProjectMembership: (projectId: ProjectId, userId: UserId, role: ProjectRole) => void;
  removeProjectMembership: (projectId: ProjectId, userId: UserId, role: ProjectRole) => void;

  // helpers for login UI
  getPrimaryCompanyForUser: (userId: UserId) => { companyId: CompanyId; role: CompanyRole } | null;
  getUserCompanyId: (userId: UserId) => CompanyId | null;
  getUserCompanyRole: (userId: UserId) => CompanyRole | null;
  getUserCompanyRoles: (userId: UserId) => CompanyRole[];
  getUserProjectRoles: (projectId: ProjectId, userId: UserId) => ProjectRole[];
  getCompanyUserIds: (companyId: CompanyId) => UserId[];
  getCompanyUsers: (companyId: CompanyId) => User[];
  addUserToCompany: (companyId: CompanyId, name: string, email: string, role?: CompanyRole) => UserId;

  // local state controls (super admin)
  clearLocalState: () => void;
  applySeedState: () => void;
};

const StoreCtx = createContext<StoreState | null>(null);


export function AppStoreProvider(props: { children: React.ReactNode }) {
  // --- mock auth/users
  const appOwnerUserId: UserId = asUserId("u_superadmin");

  const clearLocalState = () => {
    clearPersistedState();
    window.location.reload();
  };

  const applySeedState = () => {
    applySeedToPersistence();
    window.location.reload();
  };


  const persisted = loadPersistedState();

  const [users, setUsers] = useState<User[]>(() => persisted?.users ?? [
    { id: appOwnerUserId, email: "owner@projex.app", name: "Super Admin" },
    { id: asUserId("u_exec"), email: "exec@acme.co", name: "Ava Exec" },
    { id: asUserId("u_mgmt"), email: "mgmt@acme.co", name: "Max Management" },
    { id: asUserId("u_lead"), email: "lead@acme.co", name: "Priya Project Lead" },
    { id: asUserId("u_member"), email: "member@acme.co", name: "Theo Team Member" },
    { id: asUserId("u_viewer"), email: "viewer@globex.com", name: "Gina Viewer" },
  ]);

  const [companies, setCompanies] = useState<Company[]>(() => persisted?.companies ?? [
    { id: asCompanyId("co_projex"), name: "Projex" },
    { id: asCompanyId("co_acme"), name: "Acme Co" },
    { id: asCompanyId("co_globex"), name: "Globex" },
  ]);

  const [projects, setProjects] = useState<Project[]>(() => persisted?.projects ?? [
    { id: asProjectId("prj_acme_alpha"), companyId: asCompanyId("co_acme"), name: "Alpha", currency: "AUD", status: "active" },
    { id: asProjectId("prj_acme_beta"), companyId: asCompanyId("co_acme"), name: "Beta", currency: "AUD", status: "active" },
    { id: asProjectId("prj_globex_ops"), companyId: asCompanyId("co_globex"), name: "Ops Modernisation", currency: "AUD", status: "active" },
  ]);

  // memberships: allow multiple roles
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>(() => persisted?.companyMemberships ?? [
    { companyId: asCompanyId("co_projex"), userId: appOwnerUserId, role: "superadmin" },

    { companyId: asCompanyId("co_acme"), userId: "u_exec", role: "executive" },
    { companyId: asCompanyId("co_acme"), userId: "u_mgmt", role: "management" },
    { companyId: asCompanyId("co_acme"), userId: "u_lead", role: "member" },
    { companyId: asCompanyId("co_acme"), userId: "u_member", role: "member" },

    { companyId: asCompanyId("co_globex"), userId: "u_viewer", role: "member" },
  ]);

  const [projectMemberships, setProjectMemberships] = useState<ProjectMembership[]>(() => persisted?.projectMemberships ?? [
    { projectId: asProjectId("prj_acme_alpha"), userId: "u_lead", role: "lead" },
    { projectId: asProjectId("prj_acme_alpha"), userId: "u_member", role: "member" },
    { projectId: asProjectId("prj_acme_beta"), userId: "u_member", role: "lead" },
    { projectId: asProjectId("prj_globex_ops"), userId: "u_viewer", role: "viewer" },
  ]);

  // mock "session"
  const [currentUserId, setCurrentUserId] = useState<UserId>(appOwnerUserId);

  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? users[0], [users, currentUserId]);

  const isAppOwner = (userId: UserId) => userId === appOwnerUserId;

  // helper: for login label, pick the highest company role across memberships (or null)
  const getPrimaryCompanyForUser = (userId: UserId) => getPrimaryCompanyForUserFn(userId, companyMemberships);

  // selection: default to primary company of current user (or first company)
  
  const getUserCompanyId = (userId: UserId): CompanyId | null => getPrimaryCompanyForUser(userId)?.companyId ?? null;
  const getUserCompanyRole = (userId: UserId): CompanyRole | null => getPrimaryCompanyForUser(userId)?.role ?? null;

  const getUserCompanyRoles = (userId: UserId): CompanyRole[] => {
    const cid = getUserCompanyId(userId);
    if (!cid) return [];
    return companyMemberships.filter((m) => m.userId === userId && m.companyId === cid).map((m) => m.role);
  };

  const getUserProjectRoles = (projectId: ProjectId, userId: UserId): ProjectRole[] =>
    projectMemberships.filter((m) => m.projectId === projectId && m.userId === userId).map((m) => m.role);


  const getCompanyUserIds = (companyId: CompanyId): UserId[] =>
    companyMemberships
      .filter((m) => m.companyId === companyId)
      .map((m) => m.userId);

  const getCompanyUsers = (companyId: CompanyId): User[] => {
    const ids = new Set(getCompanyUserIds(companyId));
    return users.filter((u) => ids.has(u.id) && !u.disabled);
  };


const defaultCompanyId = useMemo(() => {
    return getPrimaryCompanyForUser(currentUserId)?.companyId ?? companies[0].id;
  }, [currentUserId, companies, companyMemberships]);

  const [activeCompanyId, setActiveCompanyId] = useState<CompanyId>(defaultCompanyId);
  const [activeProjectId, setActiveProjectId] = useState<ProjectId | null>(() => {
    const first = projects.find((p) => p.companyId === defaultCompanyId);
    return first ? first.id : null;
  });

  // If user changes, snap to their primary company
  const setCurrentUserIdAndSnap = (id: UserId) => {
    setCurrentUserId(id);
    const primary = getUserCompanyId(id) ?? companies[0].id;
    setActiveCompanyId(primary);
    const first = projects.find((p) => p.companyId === primary);
    setActiveProjectId(first ? first.id : null);
  };

  // project data
  const [dataByProjectId, setDataByProjectId] = useState<Record<ProjectId, ProjectDataSlice>>(() => {
    return persisted?.dataByProjectId ?? seedState.dataByProjectId;
  });

  useEffect(() => {
    const payload: PersistedStateV1 = {
      users,
      companies,
      projects,
      companyMemberships,
      projectMemberships,
      dataByProjectId,
      activeCompanyId,
      activeProjectId,
    };
    savePersistedState(payload);
  }, [users, companies, projects, companyMemberships, projectMemberships, dataByProjectId, activeCompanyId, activeProjectId]);

  const getProjectData = (projectId: ProjectId): ProjectDataSlice =>
    dataByProjectId[projectId] ?? { budgets: [], transactions: [], categories: [], subCategories: [] };

  const setProjectData = (projectId: ProjectId, patch: Partial<ProjectDataSlice>) => {
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

  const removeCompany = (companyId: CompanyId) => {
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

  const addProject = (companyId: CompanyId, name: string) => {
    const id = `prj_${uid()}`;
    const p: Project = { id, companyId, name, currency: "AUD", status: "active" };
    setProjects((prev) => [...prev, p]);
    setDataByProjectId((prev) => ({ ...prev, [id]: { budgets: [], transactions: [], categories: [], subCategories: [] } }));
    return id;
  };

  const removeProject = (projectId: ProjectId) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "archived" } : p)));
  };

  const addUser = (name: string, email: string) => {
    const id = `u_${uid()}`;
    setUsers((prev) => [...prev, { id, name, email }]);
    return id;
  };

  const addUserToCompany = (companyId: CompanyId, name: string, email: string, role: CompanyRole = "member") => {
    const userId = addUser(name, email);
    // single-company rule: the user gets exactly one company membership
    setCompanyMemberships((prev) => [...prev.filter((m) => m.userId !== userId), { companyId, userId, role }]);
    return userId;
  };

  const removeUser = (userId: UserId) => {
    if (userId === appOwnerUserId) return;
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setCompanyMemberships((prev) => prev.filter((m) => m.userId !== userId));
    setProjectMemberships((prev) => prev.filter((m) => m.userId !== userId));
    if (currentUserId === userId) setCurrentUserIdAndSnap(appOwnerUserId);
  };

  const upsertCompanyMembership = (companyId: CompanyId, userId: UserId, role: CompanyRole) => {
    // Single-company per user, but allow MULTIPLE roles within that company.
    setCompanyMemberships((prev) => {
      // remove memberships for other companies
      const kept = prev.filter((m) => m.userId !== userId || m.companyId === companyId);
      const exists = kept.some((m) => m.companyId === companyId && m.userId === userId && m.role === role);
      if (exists) return kept;
      return [...kept, { companyId, userId, role }];
    });
  };

  const removeCompanyMembership = (companyId: CompanyId, userId: UserId, role: CompanyRole) => {
    setCompanyMemberships((prev) => prev.filter((m) => !(m.companyId === companyId && m.userId === userId && m.role === role)));
  };

  const upsertProjectMembership = (projectId: ProjectId, userId: UserId, role: ProjectRole) => {
    setProjectMemberships((prev) => {
      const exists = prev.some((m) => m.projectId === projectId && m.userId === userId && m.role === role);
      if (exists) return prev;
      return [...prev, { projectId, userId, role }];
    });
  };

  const removeProjectMembership = (projectId: ProjectId, userId: UserId, role: ProjectRole) => {
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