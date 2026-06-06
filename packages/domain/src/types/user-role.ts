export type UserRole = "admin_master" | "gestor" | "operacional";

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}
