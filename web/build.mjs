// Build, with an identity that cannot be typed wrong or forgotten.
//
// Two injected constants:
//
//   __VERSION__  from package.json, so there is one place to change it and the
//                tarball name, the splash readout and the deployed BUILD file
//                cannot disagree.
//   __BUILD__    a hash of the INPUTS -- every source file plus the static
//                assets. Hashing the inputs rather than the output means the
//                id is known before compiling, so both bundles can be emitted
//                once each and both carry the same id. Hashing the output
//                needed a second pass, which left the service worker cache
//                named after a bundle that no longer existed on disk.
//
// A hand-written cache constant went stale twice. This cannot.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dev = process.argv.includes("--dev");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const VERSION = `v${pkg.version.split(".").slice(0, 2).join(".")}`;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const hash = createHash("sha256");
hash.update(VERSION);
for (const f of [...walk("src"), "public/index.html", "public/manifest.webmanifest",
                 ...walk("public/icons")]) {
  hash.update(f);
  hash.update(readFileSync(f));
}
const BUILD = hash.digest("hex").slice(0, 12);
const define = { __VERSION__: JSON.stringify(VERSION), __BUILD__: JSON.stringify(BUILD) };

await build({
  entryPoints: ["src/main.ts"],
  bundle: true, minify: !dev, format: "esm", target: "es2022",
  sourcemap: dev, outfile: "public/microgue.js", define,
});

await build({
  entryPoints: ["src/sw.ts"],
  bundle: true, minify: !dev, format: "iife", target: "es2022",
  outfile: "public/sw.js", define,
});

const sw = readFileSync("public/sw.js", "utf8");
const js = readFileSync("public/microgue.js", "utf8");
if (!sw.includes(BUILD)) {
  console.error(`build: cache id ${BUILD} did not reach public/sw.js`);
  process.exit(1);
}
if (!js.includes(BUILD) || !js.includes(VERSION)) {
  console.error(`build: ${VERSION}/${BUILD} did not reach public/microgue.js`);
  process.exit(1);
}

writeFileSync("public/BUILD", `${VERSION} ${BUILD}\n`);
console.log(`built  ${VERSION} ${BUILD}   microgue.js + sw.js`);
