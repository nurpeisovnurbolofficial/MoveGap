import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
try { loadEnvFile('.env.local'); } catch { /* Environment may already be provided. */ }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required.'); process.exit(1); }
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'server/cloud/service.test.ts', 'server/cloud/http.test.ts'], {
  stdio: 'inherit', env: { ...process.env, CLOUD_LIVE_TEST: '1' },
});
process.exitCode = result.status ?? 1;
