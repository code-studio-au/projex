import type { User } from "../types";

export const seedUsers: User[] = [
  { id: "u_superadmin", email: "owner@projex.app", name: "Super Admin" },
  { id: "u_exec", email: "exec@acme.co", name: "Ava Exec" },
  { id: "u_mgmt", email: "mgmt@acme.co", name: "Max Management" },
  { id: "u_lead", email: "lead@acme.co", name: "Priya Project Lead" },
  { id: "u_member", email: "member@acme.co", name: "Theo Team Member" },
  { id: "u_viewer", email: "viewer@globex.com", name: "Gina Viewer" },
];
