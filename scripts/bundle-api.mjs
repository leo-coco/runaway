import { build } from 'esbuild';
import { existsSync, rmSync } from 'node:fs';

/**
 * Vercel's zero-config Node builder doesn't reliably inline relative imports
 * that live outside api/ (e.g. ../server/app) for this project — the deployed
 * function crashes at boot with ERR_MODULE_NOT_FOUND for /var/task/server/app.
 * Bundling it ourselves with esbuild sidesteps that: only the api/ entry file
 * ships, with all of server/* inlined and node_modules kept external (Vercel
 * runs npm install, so those stay resolvable at runtime).
 */
const entry = 'api/[[...route]].ts';
const outfile = 'api/[[...route]].js';

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
});

if (existsSync(entry)) rmSync(entry);
