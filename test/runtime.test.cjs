const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '..');

test('startup without a token exits before connecting or creating a database', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bouncer-startup-'));
  try {
    mkdirSync(join(cwd, 'dist'));
    copyFileSync(join(root, 'dist/index.js'), join(cwd, 'dist/index.js'));
    copyFileSync(join(root, 'dist/store.js'), join(cwd, 'dist/store.js'));
    const result = spawnSync(process.execPath, [join(cwd, 'dist/index.js')], {
      cwd,
      env: { ...process.env, DISCORD_TOKEN: '', NODE_PATH: join(root, 'node_modules') },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required environment variable: DISCORD_TOKEN/);
    assert.equal(require('node:fs').existsSync(join(cwd, 'data')), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('compiled store works with the native SQLite dependency in an isolated directory', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bouncer-store-'));
  try {
    mkdirSync(join(cwd, 'dist'));
    copyFileSync(join(root, 'dist/store.js'), join(cwd, 'dist/store.js'));
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const store = require('./dist/store.js');
      store.initStore();
      store.setSetting('guild-a', 'support_phrase', "test's phrase");
      store.setSetting('guild-b', 'support_phrase', 'other phrase');
      assert.equal(store.getSetting('guild-a', 'support_phrase'), "test's phrase");
      assert.equal(store.getSetting('guild-b', 'support_phrase'), 'other phrase');
      assert.equal(store.getSetting('missing', 'support_phrase'), undefined);
      store.logVerificationAttempt('guild-b', 'user-b', 'Other', 'other', false);
      for (let i = 0; i < 1001; i++) {
        store.logVerificationAttempt('guild-a', 'user-a', 'Tester', String(i), i === 1000);
      }
      const entries = store.getVerificationLog('guild-a');
      assert.equal(entries.length, 1000);
      assert.equal(entries[0].content, '1000');
      assert.equal(entries[0].success, true);
      assert.equal(entries[999].content, '1');
      assert.equal(entries[999].success, false);
      assert.equal(store.getVerificationLog('guild-b').length, 1);
    `], {
      cwd,
      env: { ...process.env, NODE_PATH: join(root, 'node_modules') },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
