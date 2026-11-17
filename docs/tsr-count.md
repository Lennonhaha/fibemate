# TSR counting: one vocabulary, three numbers

> Issue: #509 (audit tail). Related: #442 (public numbers with several sources).
> Status: measurement only. No site copy was changed in this PR — `www/` is frozen
> this round, so the wrong number stays public until the next site change.

## The three numbers people confuse

| Name | Definition | How to get it |
|---|---|---|
| **files** | every git-tracked `*.tsr` path | `node scripts/count-tsr.cjs` → `files` |
| **objects** | distinct basename with `.tsr` stripped | same run → `basenames` |
| **lg tokens** | distinct `lg-NNN` id in the basename | same run → `tokens` |

Measured on 2026-11-16 at `2bac9661` (clean tree):

```
files           372
basenames       260
tokens           92
duplicates      112   (extra copies sharing a basename)
without token   222   (basenames that are not lg-NNN, e.g. docs_architecture)
```

## So what is wrong today

The site says, in the meta/description block of `www/index.html`:

> 372 份 .tsr 存证（**261** 个唯一令牌，2026-11-14 实测） <!-- tsr-count-exempt: quotes the site copy that was wrong on 2026-11-16 -->

- `372` is correct.
- `261` is **not reproducible by any definition**. Distinct basenames are 260,
  distinct `lg-NNN` tokens are 92.
- The number arrived with `4110972` *docs(governance): add engineering discipline
  v1.1 and correct stale TSR counts (#453)* — i.e. it was introduced by the very
  commit that was meant to fix stale counts.
- Re-computing the same three numbers at `4110972`, `66b2ca1`, `ad7caaa` and
  `HEAD` gives `372 / 260 / 92` in all four revisions. The tree did not drift
  by one file: **261 was wrong when it was typed.**

There are no untracked `.tsr` files (`git ls-files --others --exclude-standard`
matches none), so the off-by-one is not a "counted a file that later disappeared"
artefact either.

## Wording to use next time `www/` is unfrozen

Re-run the script on the day of the change and use that day's numbers:

> 372 份 .tsr 存证（260 个唯一存证对象，<当天> 实测） <!-- tsr-count-exempt: template measured 260 that same day -->

Two rules that keep this from rotting again:

1. **Never type these numbers by hand.** Run `node scripts/count-tsr.cjs` and
   paste its output. The script is the definition.
2. **Keep the unit in the sentence.** "份" counts files, "个唯一存证对象" counts
   basenames, "个 lg 令牌" counts `lg-NNN` ids. Mixing "份" and "个唯一令牌"
   is exactly how 372 and 261 ended up next to each other.

## Reproduce

```bash
node scripts/count-tsr.cjs          # human table
node scripts/count-tsr.cjs --json   # machine-readable, for CI or docs gates
node scripts/count-tsr.cjs --root /path/to/checkout
```

Exit codes: `0` ok, `2` `git ls-files` failed (not a repository, or git missing).

## Not done here

- The seven vendored `postprocessing/*.js` files under `www/docs/vendor/` still
  lack upstream licence headers. They are inside `www/`, so they are deferred to
  a round that is allowed to touch the site and to deploy.
- `packages/fml-dsa/package.json` now carries `author`, but npm does not rewrite
  published metadata; the field takes effect on the next publish, not on
  `fml-dsa@0.1.0` already on the registry.

## Addendum 2026-11-17: the same digits, a different meaning

The measurement above was taken on 2026-11-16 at `2bac9661`: 372 files, 260
basenames, 92 tokens. On that day the site line using 261 for distinct tokens was
genuinely wrong, because no definition produced 261.

A day later the numbers moved for a boring reason: commit `4b3892d` (#538) added
two tracked files, `www/docs/tsa/lg-080.tsr` and `www/docs/tsa/lg-082.tsr`. At
`ef6e327` the counter reports:

```
files           374
basenames       261
tokens           93
duplicates      113
without token   222
```

So 261 is now the correct basename count, while the old sentence used the same
digits to mean distinct tokens. Both statements were true about different
quantities a day apart. That is the trap this document exists to close: a number
without its unit and its measurement date is not a fact, it is a coincidence
waiting to be quoted.

Rule unchanged: run `node scripts/count-tsr.cjs` on the day of the edit, paste its
output, keep the unit in the sentence, and write the date next to it.
