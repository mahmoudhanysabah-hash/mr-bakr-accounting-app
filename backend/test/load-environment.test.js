const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function checkLoader(vercel) {
  const child = spawnSync(process.execPath, ['-e', `
    const Module = require('node:module');
    const originalLoad = Module._load;
    let dotenvLoads = 0;
    Module._load = function (id, ...args) {
      if (id === 'dotenv/config') {
        dotenvLoads++;
        if (process.env.VERCEL === '1') throw new Error('DOTENV_UNAVAILABLE_ON_VERCEL');
        process.env.LOCAL_ENV_TEST_MARKER = 'loaded';
        return {};
      }
      return originalLoad.call(this, id, ...args);
    };
    process.env.EXISTING_DEPLOYMENT_SETTING = 'preserved';
    require('./dist/src/load-environment.js');
    console.log(JSON.stringify({ dotenvLoads, localLoaded: process.env.LOCAL_ENV_TEST_MARKER === 'loaded', existingSetting: process.env.EXISTING_DEPLOYMENT_SETTING }));
  `], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, VERCEL: vercel, LOCAL_ENV_TEST_MARKER: '' }, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout.trim());
}

test('Vercel boot uses injected settings without needing dotenv at runtime', () => {
  assert.deepEqual(checkLoader('1'), { dotenvLoads: 0, localLoaded: false, existingSetting: 'preserved' });
});

test('local boot keeps loading dotenv before application imports', () => {
  assert.deepEqual(checkLoader(''), { dotenvLoads: 1, localLoaded: true, existingSetting: 'preserved' });
});
