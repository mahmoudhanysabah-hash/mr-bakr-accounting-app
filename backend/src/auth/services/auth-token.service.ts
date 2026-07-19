import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { requireEnvironment } from '../../common/env.validation';
import { AuthenticatedUser, JwtPayload } from '../types/auth.types';

export const JWT_ISSUER = 'mr-bakr-accounting';
export const JWT_AUDIENCE = 'mr-bakr-internal';
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '7d';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtService: JwtService) {}

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  createAccessToken(user: AuthenticatedUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload, {
      algorithm: 'HS256',
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
    });
  }

  createRefreshToken(user: AuthenticatedUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomBytes(16).toString('hex'),
    };
    return this.jwtService.sign(payload, {
      algorithm: 'HS256',
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      secret: requireEnvironment('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }
}
