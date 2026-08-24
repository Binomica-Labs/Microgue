// The error boundary, made hard to bypass.
//
// Guarding call sites one at a time does not work: I wrapped the three gesture
// listeners and missed the four pinch ones sitting immediately below them, and
// nothing complained. So the wrapper is the ONLY way to register a listener
// here, and `spec` fails the build if a raw `addEventListener` appears outside
// this file.
//
// Two layers:
//   * `on()` wraps every handler, so a throw inside one is reported and the
//     rest of the app keeps running.
//   * `installGlobalHandlers()` catches whatever still escapes -- a timer, a
//     promise, a library -- because on a phone the alternative is a console
//     nobody can read.

export type Report = (message: string) => void;

const describe = (err: unknown): string =>
  err instanceof Error
    ? `${err.name}: ${err.message}`
    : typeof err === "string" ? err : JSON.stringify(err) || "unknown error";

/** Register a listener whose handler can never throw out. */
export interface Listenable {
  addEventListener(type: string, fn: (e: Event) => void): void;
}

/**
 * Register a listener whose handler can never throw out.
 *
 * The event is typed by the caller. DOM's overloaded `addEventListener` cannot
 * be satisfied generically without fighting it, and the cast is contained to
 * this one function rather than repeated at twelve call sites.
 */
export function on(
  target: Listenable,
  type: string,
  handler: (e: never) => void,
  label: string,
  report: Report,
): void {
  target.addEventListener(type, ((e: never) => {
    try {
      handler(e);
    } catch (err) {
      report(`${label}: ${describe(err)}`);
    }
  }) as unknown as (e: Event) => void);
}

/** Wrap any function so it reports instead of throwing. */
export function safe<A extends unknown[]>(
  label: string, fn: (...a: A) => void, report: Report,
): (...a: A) => void {
  return (...a: A) => {
    try {
      fn(...a);
    } catch (err) {
      report(`${label}: ${describe(err)}`);
    }
  };
}

/** Wrap a promise-returning call so a rejection is reported, not unhandled. */
export function safeAsync(
  label: string, run: () => Promise<unknown>, report: Report,
): void {
  try {
    void run().catch((err: unknown) => { report(`${label}: ${describe(err)}`); });
  } catch (err) {
    report(`${label}: ${describe(err)}`);
  }
}

export interface GlobalHandlers { uninstall(): void }

/**
 * Catch what escapes everything else.
 *
 * A throw from a timer, a rejected promise nobody awaited, an error inside a
 * browser callback we do not own -- none of those pass through `on()`, and
 * without this they vanish into a console that does not exist on a phone.
 */
export function installGlobalHandlers(report: Report): GlobalHandlers {
  const onError = (e: Event): void => {
    const ev = e as ErrorEvent;
    const where = ev.filename ? ` (${ev.filename}:${String(ev.lineno)})` : "";
    report(`uncaught: ${ev.message || describe(ev.error)}${where}`);
  };
  const onRejection = (e: Event): void => {
    const ev = e as PromiseRejectionEvent;
    report(`unhandled promise: ${describe(ev.reason)}`);
  };

  addEventListener("error", onError);
  addEventListener("unhandledrejection", onRejection);
  return {
    uninstall(): void {
      removeEventListener("error", onError);
      removeEventListener("unhandledrejection", onRejection);
    },
  };
}
