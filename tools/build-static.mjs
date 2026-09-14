/**
 * QUIZVERSE — STATIC BUILD
 * ---------------------------------------------------------------------------
 * Copies exactly what a browser needs into ./dist so the game can be dropped on
 * ANY free static host and keep working:
 *
 *   dist/index.html      ← app shell (opens straight at the site root)
 *   dist/*               ← app modules, styles, data
 *   dist/packages/**     ← engine + AI service, imported by the browser
 *
 * Server code, tests, tools and stored teacher data are deliberately NOT copied:
 * a static host must never publish them.
 *
 *   node tools/build-static.mjs
 */

import { cp, mkdir, rm, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

async function sizeOf(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await sizeOf(full);
    else total += (await stat(full)).size;
  }
  return total;
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await cp(path.join(ROOT, 'app'), DIST, { recursive: true });
  await mkdir(path.join(DIST, 'packages'), { recursive: true });
  await cp(path.join(ROOT, 'packages', 'game-engine'), path.join(DIST, 'packages', 'game-engine'), { recursive: true });
  await cp(path.join(ROOT, 'packages', 'ai-service'), path.join(DIST, 'packages', 'ai-service'), { recursive: true });

  // Fix relative imports in dist so they don't break on subpath hosts like GitHub Pages
  const fixImports = async (dir, isSubdir = false) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'packages') {
        await fixImports(full, true);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = await readFile(full, 'utf8');
        let patched = content;
        if (isSubdir) {
          patched = patched.replace(/(['"])\.\.\/\.\.\/packages\//g, '$1../packages/');
        } else {
          patched = patched.replace(/(['"])\.\.\/packages\//g, '$1./packages/');
        }
        if (patched !== content) {
          await writeFile(full, patched, 'utf8');
        }
      }
    }
  };
  await fixImports(DIST, false);

  // A tiny marker so an operator can confirm which build is live.
  await writeFile(
    path.join(DIST, 'build-info.json'),
    JSON.stringify({
      product: 'QUIZVERSE',
      built_at: new Date().toISOString(),
      mode: 'static',
      note: 'Static build: game plays fully offline. Teacher accounts, cloud sync and the AI proxy need the Node server.',
    }, null, 2),
    'utf8',
  );

  const bytes = await sizeOf(DIST);
  console.log(`Static build ready → ${DIST}`);
  console.log(`  ${(bytes / 1024).toFixed(0)} KB total · upload this folder to Netlify / Cloudflare Pages / GitHub Pages`);
  console.log('  Entry: index.html · everything runs offline in the browser');
}

main().catch((err) => {
  console.error(`Static build failed: ${err.message}`);
  process.exit(1);
});
