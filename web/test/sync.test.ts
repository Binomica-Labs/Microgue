import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// sync.sh replaces itself while it is running, which is a real footgun: bash
// reads a script incrementally by byte offset, so overwriting the file it is
// executing makes it resume mid-line in the new contents and run fragments of
// comments as commands. `bash -n` passes on the broken version, so only
// actually running it catches this.

const SRC = readFileSync("sync.sh", "utf8");

describe("sync.sh", () => {
  it("is syntactically valid", () => {
    const dir = mkdtempSync(join(tmpdir(), "syn-"));
    const p = join(dir, "sync.sh");
    writeFileSync(p, SRC);
    expect(() => execFileSync("bash", ["-n", p])).not.toThrow();
  });

  it("replaces itself by atomic rename, never by copying over itself", () => {
    // The distinction is the whole bug. A copy corrupts the running shell.
    expect(SRC, "cp onto $self corrupts the running script").not.toMatch(
      /cp\s+"\$src\/sync\.sh"\s+"\$self"\s*$/m);
    expect(SRC).toMatch(/mv\s+-f\s+"\$self\.new"\s+"\$self"/);
  });

  it("a script that copies over itself really does corrupt -- the control", () => {
    const dir = mkdtempSync(join(tmpdir(), "syn-"));
    const target = join(dir, "run.sh");
    const replacement = join(dir, "new.sh");
    writeFileSync(replacement,
      "#!/bin/bash\necho NEW-1\necho NEW-2-considerably-longer-so-offsets-shift\n");
    writeFileSync(target,
      `#!/bin/bash\necho START\ncp ${replacement} "$0"\necho "TAIL-ONE"\necho "TAIL-TWO"\n`);
    chmodSync(target, 0o755);
    let out: string;
    try {
      out = execFileSync("bash", [target], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      out = (e as { stdout?: string }).stdout ?? "";
    }
    expect(out, "in-place copy should NOT reach the tail cleanly")
      .not.toContain("TAIL-TWO");
  });

  it("an atomic rename lets the running script finish", () => {
    const dir = mkdtempSync(join(tmpdir(), "syn-"));
    const target = join(dir, "run.sh");
    const replacement = join(dir, "new.sh");
    writeFileSync(replacement,
      "#!/bin/bash\necho NEW-1\necho NEW-2-considerably-longer-so-offsets-shift\n");
    writeFileSync(target,
      `#!/bin/bash\necho START\ncp ${replacement} "$0.new" && mv -f "$0.new" "$0"\n`
      + `echo "TAIL-ONE"\necho "TAIL-TWO"\n`);
    chmodSync(target, 0o755);
    const out = execFileSync("bash", [target], { encoding: "utf8" });
    expect(out).toContain("TAIL-ONE");
    expect(out).toContain("TAIL-TWO");
    // and the file on disk really is the new one
    expect(readFileSync(target, "utf8")).toContain("NEW-1");
  });

  it("updates itself BEFORE watching, so a red deploy cannot strand it", () => {
    // The watch exits non-zero on failure. If the update ran after it, a
    // broken sync.sh could never replace itself.
    const update = SRC.indexOf("sync.sh updated itself");
    const watch = SRC.indexOf("Watch the run this push actually started");
    expect(update).toBeGreaterThan(0);
    expect(watch).toBeGreaterThan(0);
    expect(update, "self-update must come first").toBeLessThan(watch);
  });

  it("resolves the run from the commit rather than opening a picker", () => {
    expect(SRC).toMatch(/gh run list --commit/);
    expect(SRC, "a bare `gh run watch` prompts for input")
      .not.toMatch(/gh run watch\s*$/m);
  });

  it("does not require gh to be installed", () => {
    expect(SRC).toMatch(/command -v gh/);
  });

  it("checks whether the push actually succeeded", () => {
    // `git push -q` followed by an unconditional "pushed" message is how a
    // commit ends up living on the phone while no deploy ever happens.
    expect(SRC, "a bare push hides its own failure").not.toMatch(/^git push -q\s*$/m);
    expect(SRC).toMatch(/if ! git push; then/);
    expect(SRC).toMatch(/PUSH FAILED/);
  });

  it("treats an unpushed commit as work to do, not as up to date", () => {
    // git status --porcelain only sees the WORKING TREE. A commit that failed
    // to push leaves a clean tree and looks identical to being in sync.
    expect(SRC).toMatch(/git log @\{u\}\.\.HEAD/);
    const guard = /if \[ -z "\$\(git status --porcelain\)" \] && \[ -z "\$unpushed" \]/;
    expect(SRC, "the up-to-date guard must consider unpushed commits")
      .toMatch(guard);
  });

  it("asks gh for the full SHA, which is the only form --commit resolves", () => {
    expect(SRC).toMatch(/sha="\$\(git rev-parse HEAD\)"/);
    expect(SRC, "an abbreviated sha returns no runs")
      .not.toMatch(/rev-parse --short HEAD\)"\s*$[\s\S]{0,80}--commit/m);
  });

  it("a real script that ignores push failure is the anti-pattern", () => {
    // Control: demonstrate that the shape we removed genuinely swallows an
    // error, so the assertion above is testing something real.
    const dir = mkdtempSync(join(tmpdir(), "syn-"));
    const p = join(dir, "bad.sh");
    writeFileSync(p, "#!/bin/bash\nfalse\necho 'pushed anyway'\n");
    const out = execFileSync("bash", [p], { encoding: "utf8" });
    expect(out).toContain("pushed anyway");
  });

  it("mirrors the whole tree, not a hand-listed subset", () => {
    expect(SRC).toMatch(/cp -r "\$src\/\." "\$REPO\/web\/"/);
  });
});

describe("build identity", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const buildFile = readFileSync("public/BUILD", "utf8").trim();
  const buildScript = readFileSync("build.mjs", "utf8");

  it("the version is declared once, in package.json", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Nothing may hard-code it: that is how the cache constant went stale.
    const ver = readFileSync("src/version.ts", "utf8");
    expect(ver).toContain("__VERSION__");
    expect(ver, "a literal version string here would drift")
      .not.toMatch(/["']v\d+\.\d+["']\s*;/);
  });

  it("BUILD is well formed: a version and a content hash", () => {
    // Deliberately NOT compared against package.json. `npm run build` runs the
    // tests BEFORE building, so public/BUILD is always one build behind at
    // this point. The artefact-matches-source check belongs in build.mjs,
    // which fails the build if either constant is missing from either bundle.
    expect(buildFile).toMatch(/^v\d+\.\d+ [0-9a-f]{12}$/);
  });

  it("the build hashes its inputs, so the id is known before compiling", () => {
    // Hashing the OUTPUT needed a second pass, which left the service worker
    // cache named after a bundle that no longer existed on disk.
    expect(buildScript).toMatch(/walk\("src"\)/);
    expect(buildScript, "both bundles must receive the same define")
      .toMatch(/const define = \{/);
  });

  it("the build fails loudly if the id does not reach a bundle", () => {
    expect(buildScript).toMatch(/did not reach public\/sw\.js/);
    expect(buildScript).toMatch(/did not reach public\/microgue\.js/);
  });

  it("the bundle carries a version and a hash, whichever build it is from", () => {
    const js = readFileSync("public/microgue.js", "utf8");
    expect(js, "no version in the bundle").toMatch(/v\d+\.\d+/);
    expect(js, "no build hash in the bundle").toMatch(/[0-9a-f]{12}/);
    expect(js, "the unbuilt fallback must never ship").not.toContain("unbuilt");
  });
});
