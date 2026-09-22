# `content-ok`

A content tree with nothing wrong with it, so `lintContentTree` has something to return an
empty report for — and so the walker is tested against a shape that has packs, a layer,
fixtures and templates rather than just one pack.

Fixtures for the loader, not content: the mechanics are the two halves of Prone that
`packages/engine/test/golden/packs/srd-5.2.1-min` already encodes, kept here only so the
citations name sections that exist. Real packs live in `content/`.
