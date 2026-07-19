import type { Role, User, UserStatus } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  email_verified: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  jti?: string;
  iat?: number;
  exp?: number;
};

export type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export type IssuedSession = {
  access_token: string;
  refresh_token: string;
  user: AuthenticatedUser;
};

export type UserWithPassword = Pick<
  User,
  'id' | 'name' | 'email' | 'password_hash' | 'role' | 'status' | 'email_verified'
>;

export type SafeUserRecord = Pick<
  User,
  'id' | 'name' | 'email' | 'role' | 'status' | 'email_verified'
>;

export function toAuthenticatedUser(user: SafeUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    email_verified: user.email_verified,
  };
}
