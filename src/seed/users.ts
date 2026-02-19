import type { User } from "../types";
import { asUserId } from "../types";

export const seedUsers: User[] = [
  { id: asUserId("u_superadmin"), email: "owner@projex.app", name: "Super Admin" },
  { id: asUserId("u_exec"), email: "exec@acme.co", name: "Ava Exec" },
  { id: asUserId("u_mgmt"), email: "mgmt@acme.co", name: "Max Management" },
  { id: asUserId("u_lead"), email: "lead@acme.co", name: "Priya Project Lead" },
  { id: asUserId("u_member"), email: "member@acme.co", name: "Theo Team Member" },
  { id: asUserId("u_viewer"), email: "viewer@globex.com", name: "Gina Viewer" },
];
