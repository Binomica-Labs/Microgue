// The build's identity, injected at compile time.
//
// `__VERSION__` comes from package.json and `__BUILD__` from a hash of the
// bundled assets, so neither can be typed wrong or forgotten. Showing both
// answers the only question that matters after a deploy: is this actually the
// build I just pushed?

declare const __VERSION__: string;
declare const __BUILD__: string;

// The fallback is deliberately NOT version-shaped. If it ever appears on
// screen it means the define did not reach the bundle, and that should look
// obviously wrong rather than like a plausible old version.
export const VERSION: string =
  typeof __VERSION__ === "string" ? __VERSION__ : "unbuilt";

/** Short content hash. Matches the tail of `public/BUILD` on the server. */
export const BUILD: string =
  typeof __BUILD__ === "string" ? __BUILD__.slice(0, 7) : "dev";

export const FULL = `${VERSION} · ${BUILD}`;
