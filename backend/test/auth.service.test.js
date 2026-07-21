const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../dist/src/auth/auth.service');

const activeUser = {
  id: 'user-1',
  name: 'Admin',
  email: 'admin@example.com',
  password_hash: 'stored-hash',
  role: 'ADMIN',
  status: 'ACTIVE',
  email_verified: true,
};

function createAudit() {
  return { log: async () => undefined };
}

test('validateUser returns a safe user without the password hash', async () => {
  const prisma = {
    user: {
      findUnique: async () => activeUser,
    },
  };
  const tokenService = {};
  const passwordService = {
    compare: async (password, hash) => password === 'correct-password' && hash === 'stored-hash',
  };
  const service = new AuthService(prisma, createAudit(), tokenService, passwordService);

  const user = await service.validateUser(' ADMIN@EXAMPLE.COM ', 'correct-password');

  assert.equal(user.email, 'admin@example.com');
  assert.equal(user.role, 'ADMIN');
  assert.equal(Object.hasOwn(user, 'password_hash'), false);
});

test('refreshTokens rotates the refresh token and rejects reuse', async () => {
  let oldSessionActive = true;
  let tokenCounter = 0;
  const createdSessions = [];
  const prisma = {
    session: {
      findUnique: async ({ where }) => {
        if (where.refresh_token !== 'hash:old-refresh-token' || !oldSessionActive) return null;
        return {
          id: 'session-1',
          user_id: activeUser.id,
          expires_at: new Date(Date.now() + 60_000),
          user: activeUser,
        };
      },
      deleteMany: async ({ where }) => {
        if (where.id === 'session-1' && oldSessionActive) {
          oldSessionActive = false;
          return { count: 1 };
        }
        return { count: 0 };
      },
      create: async ({ data }) => {
        createdSessions.push(data);
        return data;
      },
    },
  };
  const tokenService = {
    hash: (token) => `hash:${token}`,
    createAccessToken: (_user, sessionId) => {
      assert.ok(sessionId);
      return `access-${++tokenCounter}`;
    },
    createRefreshToken: (_user, sessionId) => {
      assert.ok(sessionId);
      return `refresh-${tokenCounter}`;
    },
  };
  const passwordService = {};
  const service = new AuthService(prisma, createAudit(), tokenService, passwordService);

  const result = await service.refreshTokens(activeUser.id, 'old-refresh-token');

  assert.equal(result.refresh_token, 'refresh-1');
  assert.equal(createdSessions.length, 1);
  assert.ok(createdSessions[0].id);
  assert.equal(createdSessions[0].refresh_token, 'hash:refresh-1');
  await assert.rejects(
    () => service.refreshTokens(activeUser.id, 'old-refresh-token'),
    /Invalid or expired refresh token/,
  );
});
