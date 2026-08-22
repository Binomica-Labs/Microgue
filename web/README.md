
## TypeScript, enforced

`npm run verify` gates the build. It runs, in order:

| | |
|---|---|
| `guard` | fails if any `.js` appears under `src/` or `test/` |
| `check` | `tsc --noEmit` at maximum strictness |
| `lint`  | ESLint `strictTypeChecked` with every escape hatch as an error |
| `test`  | 45 assertions |

`any`, `@ts-ignore`, `@ts-nocheck`, non-null `!`, unsafe member access on
`any`, `==`, and implicit coercion are all **errors**, not warnings. `index.html`
carries no inline script. `public/microgue.js` is build output — never edited,
never read.

Two deliberate relaxations: numbers in template literals are allowed (idiomatic,
not unsound), and `!` is permitted in `test/` (a wrong assertion there fails the
test; it cannot reach a user).
