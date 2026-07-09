const unsafeDefaults = new Set([
  'super-secret-key-change-me',
  'super-refresh-secret',
  'dev-local-access-secret-change-before-production-2026',
  'dev-local-refresh-secret-change-before-production-2026',
  '12345678901234567890123456789012',
]);

export function validateEnvironment() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'CORS_ORIGIN'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const unsafe = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'].filter((key) =>
    unsafeDefaults.has(process.env[key] || ''),
  );

  if (unsafe.length > 0) {
    throw new Error(`Unsafe default secrets are not allowed: ${unsafe.join(', ')}`);
  }

  const shortSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'].filter(
    (key) => (process.env[key] || '').length < 32,
  );

  if (shortSecrets.length > 0) {
    throw new Error(`Security secrets are too short: ${shortSecrets.join(', ')}`);
  }
}
