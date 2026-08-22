// Build with a content-derived service worker cache name.
//
// The cache version used to be a constant edited by hand, which meant a
// forgotten bump shipped a deploy that CI passed and no user ever received.
// Hashing the actual output removes the possibility.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dev = process.argv.includes("--dev");

await build({
  entryPoints: ["src/main.ts"],
  bundle: true, minify: !dev, format: "esm", target: "es2022",
  sourcemap: dev, outfile: "public/microgue.js",
});

// Hash everything the worker precaches, so any asset change rotates the cache.
const hash = createHash("sha256");
hash.update(readFileSync("public/microgue.js"));
hash.update(readFileSync("public/index.html"));
hash.update(readFileSync("public/manifest.webmanifest"));
for (const f of readdirSync("public/icons").sort()) {
  hash.update(readFileSync(`public/icons/${f}`));
}
const build_ = hash.digest("hex").slice(0, 12);

await build({
  entryPoints: ["src/sw.ts"],
  bundle: true, minify: !dev, format: "iife", target: "es2022",
  outfile: "public/sw.js",
  define: { __BUILD__: JSON.stringify(build_) },
});

const sw = readFileSync("public/sw.js", "utf8");
if (!sw.includes(build_)) {
  console.error(`build: cache version ${build_} did not reach public/sw.js`);
  process.exit(1);
}
writeFileSync("public/BUILD", `${build_}\n`);
console.log(`built  microgue.js + sw.js   cache=microgue-${build_}`);
