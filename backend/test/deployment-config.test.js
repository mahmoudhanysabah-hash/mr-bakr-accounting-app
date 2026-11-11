const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../vercel.json');

test('the NestJS service keeps source and dependency paths in the same runtime root', () => {
  assert.equal(config.services.backend.framework, 'nestjs');
  assert.equal(config.services.backend.root, 'backend/');
  assert.equal(config.services.backend.entrypoint, 'src/server.ts');
  assert.equal(config.services.backend.buildCommand, 'npm run build');
  // A flattened dist/ tree would put src/*.js outside backend/node_modules/.
  assert.equal(config.services.backend.outputDirectory, '.');
  assert.deepEqual(config.rewrites.slice(0, 2), [
    { source: '/api/backend', destination: { service: 'backend' } },
    { source: '/api/backend/:path*', destination: { service: 'backend' } },
  ]);
  assert.equal(config.services.frontend.framework, 'nextjs');
});
