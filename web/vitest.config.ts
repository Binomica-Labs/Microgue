import { defineConfig } from "vitest/config";

// The generation sweeps are the tests that have caught the most real bugs in
// this project, and they are slow by nature: "every boss floor holds an elite"
// builds 320 floors. On an idle machine it lands around 3.4 s, which fits
// inside vitest's 5 s default -- and on a loaded one it does not, so the suite
// went red for a reason that has nothing to do with the code.
//
// That is the same trap HANDOVER records under "Timing assertions are smoke
// bounds, not measurements": a bound tight enough to measure THIS machine is a
// bound that fails on a busy one, and a flaky test is worse than no test. The
// three deliberate wall-clock assertions in the suite still assert their own
// bounds explicitly; this only stops the harness timing out underneath them.
export default defineConfig({
  test: { testTimeout: 30000, hookTimeout: 30000 },
});
