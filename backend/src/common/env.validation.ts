const SECRET_NAMES = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'] as const;

const unsafeDefaults = new Set([
  'super-secret-key-change-me',
  'super-refresh-secret',
  'dev-local-access-secret-change-before-production-2026',
  'dev-local-refresh-secret-change-before-production-2026',
  '12345678901234567890123456789012',
  'replace-with-at-least-32-random-characters',
]);

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnvironment() {
  const required = ['DATABASE_URL', ...SECRET_NAMES, 'CORS_ORIGIN'];
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const unsafe = SECRET_NAMES.filter((key) => unsafeDefaults.has(process.env[key]?.trim() || ''));
  if (unsafe.length > 0) {
    throw new Error(`Unsafe default secrets are not allowed: ${unsafe.join(', ')}`);
  }

  const shortSecrets = SECRET_NAMES.filter((key) => (process.env[key]?.trim().length || 0) < 32);
  if (shortSecrets.length > 0) {
    throw new Error(`Security secrets are too short: ${shortSecrets.join(', ')}`);
  }

  const origins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) || [];
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one allowed origin.');
  }

  if (process.env.NODE_ENV === 'production') {
    const localOrigin = origins.find((origin) => /localhost|127\\.0\\.0\\.1/i.test(origin));
    if (localOrigin) {
      throw new Error('Production CORS_ORIGIN cannot point to localhost.');
    }
    if (process.env.ALLOW_DEV_AUTH_TOKENS === 'true') {
      throw new Error('ALLOW_DEV_AUTH_TOKENS must be false in production.');
    }
  }
}
