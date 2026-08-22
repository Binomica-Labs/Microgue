# One tap, no fuss

The end state: an icon on your home screen that opens the game fullscreen,
instantly, with no browser chrome and **no network required**. One-time setup.

## 1. Publish (once)

GitHub Pages is free, HTTPS, and you already own the repo. HTTPS is not
optional — service workers and installability both refuse to run without it.

```bash
git add . && git commit -m "Browser port" && git push
```

Then in the repo: **Settings → Pages → Source → GitHub Actions**.

`.github/workflows/pages.yml` does the rest on every push: verify, typecheck,
lint, test, bundle, deploy. If any check fails the old version stays up.

Your URL will be `https://binomica-labs.github.io/Microgue/`.

> If the repo isn't at the domain root, set `"id"` in
> `public/manifest.webmanifest` to match the subpath (already set to
> `/microgue/` — change it to `/Microgue/` to match the repo name exactly).

## 2. Install (once, per device)

**Android / Chrome** — open the URL, menu **⋮ → Add to Home screen** (or take
the install prompt when it appears). You get a real launcher icon.

**iOS / Safari** — open the URL, **Share → Add to Home Screen**. Must be Safari;
Chrome on iOS can't install PWAs.

**Desktop** — the install icon in the address bar.

## 3. Done

Tap the icon. Fullscreen, no address bar, offline. Progress saves to
localStorage on every action, so closing it mid-run loses nothing.

## Updating

Push. The service worker fetches the new bundle on next launch and swaps it in.
Bump `VERSION` in `src/sw.ts` when you change cached assets, or a stale cache
will keep serving the old build.

## Testing locally

```bash
npm run build
npx serve public
```

Service workers work on `localhost` without HTTPS, so install behaviour is
testable there. `file://` will not work — no service worker, no install.
