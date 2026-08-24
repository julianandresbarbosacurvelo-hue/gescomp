export type SessionRole = { roleCode: string; establishmentId: string; establishmentName: string };
export type SessionContext = {
  userId: string;
  fullName: string;
  email: string;
  roles: SessionRole[];
};

export function getActiveRoleCodes(roles: SessionRole[], establishmentId: string): string[] {
  return roles.filter((r) => r.establishmentId === establishmentId).map((r) => r.roleCode);
}
