# Source-of-truth note

The canonical TypeScript source for this package lives on a different
machine. The `dist/` directory checked in here was extracted from the
published 1.2.3 tarball and patched directly (system-prompt update +
`ask_user_question` tool wiring). When syncing from the machine that
holds the real `src/`, port these two changes back into TS and rebuild
before publishing 1.2.4.
