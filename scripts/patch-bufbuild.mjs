/**
 * Patches all installed copies of @bufbuild/protobuf to add missing `types`
 * conditions in their exports maps. The package ships .d.ts files but doesn't
 * declare them, so TypeScript and Node.js cannot find subpath exports without
 * this patch.
 *
 * Runs automatically via the `postinstall` npm script.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function patchPackage(pkgPath) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return;
  }

  let changed = false;

  if (!pkg.types) {
    pkg.types = './dist/esm/index.d.ts';
    changed = true;
  }

  for (const [key, val] of Object.entries(pkg.exports ?? {})) {
    if (val && typeof val === 'object' && !val.types) {
      const esm = val.import;
      if (typeof esm === 'string' && esm.endsWith('.js')) {
        pkg.exports[key] = { types: esm.replace('.js', '.d.ts'), ...val };
        changed = true;
      }
    }
  }

  // Also ensure /codegenv2 is exported at runtime if missing
  if (!pkg.exports?.['./codegenv2']) {
    pkg.exports = pkg.exports ?? {};
    pkg.exports['./codegenv2'] = {
      types: './dist/esm/codegenv2/index.d.ts',
      import: './dist/esm/codegenv2/index.js',
      require: './dist/cjs/codegenv2/index.js',
    };
    changed = true;
  }

  if (changed) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log(`patch-bufbuild: patched ${pkgPath}`);
  } else {
    console.log(`patch-bufbuild: already patched ${pkgPath}, skipping.`);
  }
}

// Patch root install
patchPackage(resolve(root, 'node_modules/@bufbuild/protobuf/package.json'));

// Patch any nested installs (e.g. packages/shared/node_modules/@bufbuild/protobuf)
for (const pkg of readdirSync(resolve(root, 'packages'))) {
  const nested = resolve(root, 'packages', pkg, 'node_modules/@bufbuild/protobuf/package.json');
  try {
    statSync(nested);
    patchPackage(nested);
  } catch {
    // no nested copy here, skip
  }
}
