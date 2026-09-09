# Workspace Source utilities

Shared implementation utilities for independently installed Sources. This package is not a Source, a Strategy, a Loader or a storage registry. Each caller owns its schema, directory, scope, operations and presentation.

`RecordStore` provides atomic revision-fenced persistence and per-record history. `createRecordSource` adapts an owned collection to the public memory contracts. `./client` supplies a browser-only collection editor.

Run `pnpm verify` to typecheck, test and build the package in isolation.
