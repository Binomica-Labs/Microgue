// Keeping the installed app up to date.
//
// The worker already calls skipWaiting and clients.claim, which is necessary
// and not sufficient. Three things kept an installed PWA a version or two
// behind, and they stack:
//
//   1. GitHub Pages serves sw.js with a Cache-Control max-age, and the browser
//      fetches sw.js THROUGH the HTTP cache when checking for updates. So the
//      update check could be answered from a stale copy for minutes.
//      `updateViaCache: "none"` forces it to the network.
//
//   2. Registration ran once, on `load`. A PWA resumed from the background
//      never fires `load` again, so it never asked whether there was an
//      update. It has to check when it becomes visible.
//
//   3. Even once a new worker takes control, the PAGE is still running the
//      JavaScript it parsed at startup. The cache is new; the running game is
//      old. Something has to reload it.
//
// Together those explain "close and reopen two or three times": each cold
// start advanced the process by one step.

export interface UpdateHooks {
  /** Told when a reload is about to happen, so the caller can say so. */
  readonly onUpdating?: () => void;
  /** Called instead of reloading, if the caller wants to defer. */
  readonly reload?: () => void;
}

/** Guard against a reload loop: only ever reload once per page life. */
let reloading = false;

export function installUpdater(hooks: UpdateHooks = {}): void {
  if (!("serviceWorker" in navigator)) return;

  // Was there already a controller? On a first-ever install there is not, and
  // the controllerchange that follows is the initial claim, not an update --
  // reloading on that one would restart the app the first time it is opened.
  const hadController = navigator.serviceWorker.controller !== null;

  // Every callback here is wrapped: a throw in an update check must not stop
  // the app, and there is no console to read it on a phone.
  const swallow = (fn: () => void): (() => void) => () => {
    try { fn(); } catch { /* an update check is not worth a crash */ }
  };

  navigator.serviceWorker.addEventListener("controllerchange", swallow(() => {
    if (!hadController || reloading) return;
    reloading = true;
    hooks.onUpdating?.();
    if (hooks.reload) hooks.reload();
    else location.reload();
  }));

  void navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then((reg) => {
      const check = (): void => { void reg.update().catch(() => undefined); };

      // Ask on resume. This is the one that matters on a phone, where the app
      // is suspended rather than closed.
      document.addEventListener("visibilitychange", swallow(() => {
        if (document.visibilityState === "visible") check();
      }));
      addEventListener("focus", swallow(check));
      // And on a long session, occasionally.
      setInterval(swallow(check), 15 * 60 * 1000);
      swallow(check)();
    })
    .catch(() => undefined);
}

/** True when a worker is waiting to take over. Exposed for a status readout. */
export async function updatePending(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.waiting !== null && reg?.waiting !== undefined;
  } catch { return false; }
}
