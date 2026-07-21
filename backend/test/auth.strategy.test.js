const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-that-is-at-least-32-characters';

const { JwtStrategy } = require('../dist/src/auth/strategies/jwt.strategy');
const { JwtRefreshStrategy } = require('../dist/src/auth/strategies/jwt-refresh.strategy');

const activeUser = {
  id: 'user-1',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  email_verified: true,
};

test('access authentication accepts only the protected cookie', () => {
  const strategy = new JwtStrategy({ session: { findUnique: async () => null } });

  assert.equal(
    strategy._jwtFromRequest({
      cookies: {},
      headers: { authorization: 'Bearer copied-access-token' },
    }),
    null,
  );
  assert.equal(
    strategy._jwtFromRequest({
      cookies: { access_token: 'protected-cookie-token' },
      headers: {},
    }),
    'protected-cookie-token',
  );
});

test('access authentication rejects a revoked session', async () => {
  const strategy = new JwtStrategy({
    session: {
      findUnique: async ({ where }) =>
        where.id === 'active-session'
          ? {
              id: 'active-session',
              user_id: activeUser.id,
              expires_at: new Date(Date.now() + 60_000),
              user: activeUser,
            }
          : null,
    },
  });

  const user = await strategy.validate({ sub: activeUser.id, sid: 'active-session' });
  assert.equal(user.id, activeUser.id);

  await assert.rejects(
    () => strategy.validate({ sub: activeUser.id, sid: 'revoked-session' }),
    /Session inactive or not found/,
  );
});

test('refresh authentication rejects bearer tokens', () => {
  const strategy = new JwtRefreshStrategy({ session: { findUnique: async () => null } });

  assert.equal(
    strategy._jwtFromRequest({
      cookies: {},
      headers: { authorization: 'Bearer copied-refresh-token' },
    }),
    null,
  );
  assert.equal(
    strategy._jwtFromRequest({
      cookies: { refresh_token: 'protected-refresh-cookie' },
      headers: {},
    }),
    'protected-refresh-cookie',
  );
});
