// Runs the whole test suite: starts a server on a spare port, runs both test
// files against it, and shuts the server down again.
//
//   npm test

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..');
// Pick a free port so the suite never collides with a running server.
const PORT = Number(process.env.TEST_PORT || 4572);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = path.join(serverDir, 'data-test');

fs.rmSync(dataDir, { recursive: true, force: true });

function run(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd || serverDir,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), RAFIQ_DATA: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (d) => {
  serverLog += d.toString();
});
server.stderr.on('data', (d) => {
  serverLog += d.toString();
});

const stop = () => {
  if (!server.killed) server.kill();
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

// Wait for the server to answer.
let up = false;
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await new Promise((r) => setTimeout(r, 200));
}

if (!up) {
  console.error('the test server did not start:\n' + serverLog);
  stop();
  process.exit(1);
}

console.log(`test server up on ${BASE}\n`);

const suites = [
  { name: 'end-to-end', file: 'test/e2e.mjs', loader: false },
  { name: 'app flow', file: 'test/app-flow.mjs', loader: true },
];

let failed = 0;
for (const suite of suites) {
  console.log(`\n--- ${suite.name} ---`);
  const args = suite.loader ? ['--import', './test/loader.mjs', suite.file] : [suite.file];
  const code = await run(args, { env: { BASE } });
  if (code !== 0) failed++;
}

stop();
// Give the output a moment to reach the pipe before the process goes away.
await new Promise((r) => setTimeout(r, 100));
process.exit(failed ? 1 : 0);
