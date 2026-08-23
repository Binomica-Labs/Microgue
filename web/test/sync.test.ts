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

  it("mirrors the whole tree, not a hand-listed subset", () => {
    expect(SRC).toMatch(/cp -r "\$src\/\." "\$REPO\/web\/"/);
  });
});
