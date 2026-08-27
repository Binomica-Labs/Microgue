// Screenshots of the REAL game, in real Chrome.
//
// Every test in this repo asserts on recorded canvas CALLS. golden.test.ts
// hashes 77575 of them and scaling.test.ts checks their coordinates, and
// neither has ever looked at a pixel -- which is why HANDOVER says to treat any
// visual claim as a hypothesis. This closes that: headless Chrome renders the
// shipped bundle and writes PNGs.
//
// Zero dependencies on purpose. Node 22 has WebSocket and fetch built in, so
// this drives Chrome over CDP directly rather than pulling in Playwright and
// its ~300 MB of browsers for a screenshot.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? "public");
const OUT = resolve(process.argv[3] ?? "shots");

const CHROME = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                "/opt/google/chrome/chrome",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
  .find((p) => p.startsWith("/") ? existsSync(p) : true);

const TYPE = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon" };

/** Viewports that matter, with real device pixel ratios. */
const VIEWS = [
  { name: "phone", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "small-phone", width: 320, height: 640, dpr: 2, mobile: true },
  { name: "tablet", width: 820, height: 1180, dpr: 2, mobile: true },
  { name: "desktop", width: 1440, height: 900, dpr: 2, mobile: false },
];

/** Each scene drives the real game through the console handle in debug.ts. */
const SCENES = [
  { name: "1-splash", drive: "null" },
  { name: "2-floor", drive: "microgue.start(0); for (let i=0;i<12;i++) microgue.press('wait'); null" },
  { name: "3-plasmid", drive: "microgue.start(0); microgue.press('plasmid'); null" },
  { name: "4-pathways", drive: "microgue.start(0); microgue.press('map'); null" },
  { name: "5-notebook", drive: "microgue.start(0); microgue.press('notes'); null" },
  { name: "6-bench", drive: "microgue.start(0); microgue.press('research'); null" },
  // The whole floor, revealed and zoomed out. Wall contour is the thing this
  // one is for: FOV normally shows a few tiles and you cannot judge a
  // silhouette from that.
  { name: "7-walls", drive:
    "microgue.start(0);"
    + "const g = microgue.game; g.level.sight.seen.fill(1); g.level.sight.visible.fill(1);"
    + "g.zoom = 0.42; g.frame(1000); null" },
];

function serve(root) {
  return new Promise((ok) => {
    const s = createServer(async (req, res) => {
      const url = (req.url ?? "/").split("?")[0];
      const p = join(root, normalize(url === "/" ? "/index.html" : url));
      try {
        const buf = await readFile(p);
        res.writeHead(200, { "content-type": TYPE[extname(p)] ?? "application/octet-stream",
                             "cache-control": "no-store" });
        res.end(buf);
      } catch { res.writeHead(404); res.end("not found"); }
    });
    s.listen(0, "127.0.0.1", () => ok({ server: s, port: s.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("cdp open")); });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const w = c.waiting.get(m.id);
      if (!w) return;
      c.waiting.delete(m.id);
      m.error ? w.no(new Error(`${m.error.message} (${JSON.stringify(m.error)})`)) : w.ok(m.result);
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      this.waiting.set(id, { ok, no });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.waiting.delete(id)) no(new Error(`timeout: ${method}`));
      }, 30000);
    });
  }
}

async function main() {
  if (!CHROME) { console.error("no chrome found"); process.exit(1); }
  await mkdir(OUT, { recursive: true });
  const { server, port } = await serve(ROOT);
  const profile = await mkdtemp(join(tmpdir(), "microgue-shots-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
  ], { stdio: "ignore" });

  let devPort = null;
  for (let i = 0; i < 100 && devPort === null; i++) {
    await sleep(100);
    try { devPort = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; }
    catch { /* not up yet */ }
  }
  if (!devPort) { console.error("chrome did not start"); process.exit(1); }

  const ver = await (await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();
  const cdp = await Cdp.open(ver.webSocketDebuggerUrl);
  const written = [];

  for (const v of VIEWS) {
    for (const s of SCENES) {
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile,
      }, sessionId);
      // Pinned BEFORE the page runs. A new run seeds its dungeon from
      // Date.now(), so without this every screenshot is of a different cave
      // and two runs cannot be compared -- which is most of what a visual
      // harness is for. The test suite pins the clock for exactly this reason.
      // Storage is cleared with it, or scene 2 resumes scene 1's save and the
      // turn counter climbs across the sheet.
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: "try { localStorage.clear(); } catch {}\n"
          + "Date.now = () => 1700000000000;",
      }, sessionId);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` }, sessionId);
      await sleep(900);                       // boot, first frames, sprite cache

      const drive = await cdp.send("Runtime.evaluate", {
        expression: s.drive, awaitPromise: false, returnByValue: true,
      }, sessionId);
      if (drive.exceptionDetails) {
        console.error(`  ${v.name}/${s.name}: ${drive.exceptionDetails.text}`);
      }
      await sleep(400);                       // let the driven state render

      const shot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      const file = join(OUT, `${v.name}--${s.name}.png`);
      await writeFile(file, Buffer.from(shot.data, "base64"));
      written.push(file);

      // The state the shot was taken IN, so a screenshot is never ambiguous.
      const st = await cdp.send("Runtime.evaluate", {
        expression: "JSON.stringify(microgue?.state?.() ?? null)", returnByValue: true,
      }, sessionId);
      const state = st.result?.value ? JSON.parse(st.result.value) : null;
      const errs = state?.toasts?.filter((t) => t.startsWith("error:")) ?? [];
      console.log(`${v.name.padEnd(12)} ${s.name.padEnd(12)} `
        + (state ? `F${state.floor} turn ${state.turn} hp ${state.hp}/${state.maxhp} `
                 + `atp ${state.atp}/${state.atpMax} L${state.strain}` : "(no state)")
        + (errs.length ? `   ERRORS: ${errs.join(" | ")}` : ""));
      if (errs.length) process.exitCode = 1;

      await cdp.send("Target.closeTarget", { targetId });
    }
  }

  chrome.kill();
  server.close();
  await new Promise((ok) => chrome.on("exit", ok));   // or the profile rmdir races
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  console.log(`\n${written.length} screenshots -> ${OUT}`);
}

await main();
