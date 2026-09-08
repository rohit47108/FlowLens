# History performance baseline

## Scope and reproduction

Measured 2026-09-07 at `3d1f45a3f0252d1b7cb887e6e2058478329bcd0b` (history source unchanged since `8d3f684`). Node 24.17.0, Windows 10.0.26200, Intel Core i9-14900HX. These are synthetic CPU measurements, not browser interaction or release performance results.

The public `undo` and `redo` functions received genuine module-issued records from sequential `RENAME_PROJECT` commands on the committed one-room synthetic fixture. Every timed action asserted its successful semantic result. One warmup preceded three measured samples at each size. Fixture construction used an empty prior-record context for each unique command and assembled a valid history; neither dispatch against a growing ledger nor `appendHistory` cloning is included in the timings. Redo included the new undo receipt and record.

The diagnostic script is in the phase scratch workspace as `full-history-profile.mjs`; it loads current modules through Vite, makes no product edits, and reports hardware, commit, and each sample range. Command: `node .superpowers/sdd/2026-08-24-flowlens-foundation/full-history-profile.mjs`. The process completed with exit code 0.

## Results

Milliseconds per public operation:

| Forward entries | Undo median | Undo range | Redo median | Redo range |
| --- | --- | --- | --- | --- |
| 128 | 4.54 | 4.29–4.82 | 5.39 | 5.21–5.41 |
| 512 | 8.12 | 7.37–8.79 | 8.70 | 8.46–11.68 |
| 2,048 | 64.28 | 57.18–67.83 | 66.46 | 60.33–81.75 |
| 4,094 | 156.81 | 145.77–162.28 | 163.16 | 146.38–186.97 |

The largest fixture leaves two records below the 4,096-record limit for undo and redo. No timing threshold is established by three samples on one developer machine.

## Consequences and remaining evidence

Large histories can cause substantial synchronous work even for a small room. Before the interactive release, profile representative room sizes and receipt-heavy histories in Chromium, trace validation/clone cost, and measure real save/reopen/undo interactions. Do not remove authority, partition, or schema checks to meet a latency target. Any optimization must preserve the existing regressions and show an improvement beyond sample variance under the same workload.

This baseline includes public operation validation but excludes persistence, full journal reconstruction, rendering, and many-receipt ancestry validation. The older private-helper-only benchmark was incomplete and used a subsequently corrected implementation; it is not a comparison baseline or evidence of a speedup. No optimization is claimed here.
