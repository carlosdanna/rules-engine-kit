# Golden cases

One case is one folder. The harness in `../harness.ts` discovers every folder here that has
a `case.json` and `../cases.test.ts` runs all of them, so adding a case is adding a
directory — no test file to edit.

```text
<case-name>/
  case.json           description, the ordered pack directories, the seed
  situation.json      a literal Situation (schemaVersion 2)
  forced.json         optional; dice pinned by roll id (ADR-0011)
  expected.json       HAND-DERIVED from the SRD; a partial Outcome
  trace.snap.txt      generated; the full trace as JSON
  narrative.snap.txt  generated; the trace as prose (NFR-7)
```

**`expected.json` is written by hand and the two `.snap` files are not.** That asymmetry is
the whole design (NFR-4). `expected.json` is a claim about what the rules say, derived from
the SRD sections the pack's rules cite and checked with `toMatchObject`, so it must never be
regenerated from what the engine printed — if it disagrees with the engine, one of them is
wrong and that is the finding. The snapshots are a record of a *format*, which ADR-0010 and
ADR-0014 explicitly leave unstable apart from `seq` ordering and the event kinds; they are
expected to churn, are refreshed with `pnpm test -u`, and are reviewed as a diff.

They are asserted by separate `it`s for the same reason, so a trace-format change fails the
trace assertion alone and leaves the outcome, identity and determinism assertions green.

Any case can be replayed from the command line — same packs, same seed, same dice:

```sh
pnpm engine run \
  --packs packages/engine/test/golden/packs/srd-5.2.1-min \
  --situation packages/engine/test/golden/cases/<case-name>/situation.json \
  --seed golden \
  --forced packages/engine/test/golden/cases/<case-name>/forced.json \
  --narrative
```
