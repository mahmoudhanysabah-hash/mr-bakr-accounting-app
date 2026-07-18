export const allowedRoles = ['ADMIN', 'ACCOUNTANT', 'FINANCE_MANAGER', 'ASSISTANT'] as const;

export type AccountingRole = (typeof allowedRoles)[number];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AccountingRole;
  status?: string;
};

export function isAllowedRole(role: unknown): role is AccountingRole {
  return typeof role === 'string' && allowedRoles.includes(role as AccountingRole);
}

export function extractAuthUser(payload: unknown): AuthUser | null {
  const outer = payload as { data?: unknown; user?: unknown } | null | undefined;
  const data = outer && typeof outer === 'object' && 'data' in outer ? outer.data : payload;
  const candidate = (data as { user?: unknown } | null | undefined)?.user ?? data;
  const user = candidate as Partial<AuthUser> | null | undefined;

  if (!user || typeof user !== 'object' || !isAllowedRole(user.role)) {
    return null;
  }

  return user as AuthUser;
}

export function homeForRole(role: AccountingRole) {
  return role === 'ASSISTANT' ? '/sessions' : '/dashboard';
}

export function canAccessDashboardPath(role: AccountingRole, pathname: string) {
  if (role === 'ASSISTANT') {
    return pathname === '/sessions' || pathname.startsWith('/sessions/');
  }

  if (pathname === '/admin/users' || pathname.startsWith('/admin/users/')) {
    return role === 'ADMIN';
  }

  return true;
}
