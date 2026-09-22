# `content-broken`

Every `ContentIssueCode` exactly once, so `test/content/lint.test.ts` can assert that one
run of `content:lint` reports all of them rather than stopping at the first.

The offenders are spread over four packs on purpose. A duplicate fact path and an
unparseable file abandon the pack they are in — there is no registry to lint conditions
against, and no document to lint — so keeping them in their own packs is what lets the
mistakes in `base-5.0.0/` still be reported in the same pass.

Nothing here is content. The mechanics are nonsense; only the shapes matter.
