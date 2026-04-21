/**
 * Patches @bufbuild/protobuf's package.json to add missing `types` conditions
 * in its exports map. The package ships .d.ts files but doesn't declare them,
 * so TypeScript cannot find them without this patch.
 *
 * This is a known issue with how @bufbuild/protobuf v2 was published.
 * Re-runs automatically via the `postinstall` npm script.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'node_modules/@bufbuild/protobuf/package.json');

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch {
  console.log('patch-bufbuild: package not found, skipping.');
  process.exit(0);
}

if (pkg.types) {
  console.log('patch-bufbuild: already patched, skipping.');
  process.exit(0);
}

pkg.types = './dist/esm/index.d.ts';

for (const [key, val] of Object.entries(pkg.exports)) {
  if (val && typeof val === 'object' && !val.types) {
    const esm = val.import;
    if (typeof esm === 'string' && esm.endsWith('.js')) {
      pkg.exports[key] = { types: esm.replace('.js', '.d.ts'), ...val };
    }
  }
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('patch-bufbuild: patched @bufbuild/protobuf exports map.');
