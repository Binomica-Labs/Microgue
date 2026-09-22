# Microgue

A microbiology roguelike. You are a bacterial strain descending a water
column: build a plasmid out of real genes, eat what you can metabolise, and
outlive what lives at each depth.

**Play:** https://binomica-labs.github.io/Microgue/

The game is TypeScript and lives in [`web/`](web/). Build, test and deploy
notes are in [`web/README.md`](web/README.md) and [`web/INSTALL.md`](web/INSTALL.md);
the design history is in [`HANDOVER.md`](HANDOVER.md).

```sh
cd web
npm ci
npm run verify   # typecheck, lint, full test suite
npm run build    # verify, then bundle into web/public
```

The original Lua/LÖVE prototype was removed in v1.42.0. It is still in git
history: `git checkout c25b9e9 -- main.lua concord jumper` and so on (c25b9e9 is v1.41.0, the last commit that has it).
