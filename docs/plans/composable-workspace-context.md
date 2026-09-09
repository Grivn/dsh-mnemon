# Composable workspace context

## Contract and ownership

Each data authority is an independently installable Source. Sources own persistence, revision checks, proposed changes, read grants, operations and bilingual management pages. Providers remain private children of Memory Spaces. A workspace Strategy selects public Source capabilities and emits one bounded View; its enhancements contribute pure policies in explicitly owned slots. No policy gains filesystem, network, process or cross-session authority through composition.

The existing three-tier Starter remains available. The workspace composition is explicit, and disabling any optional plugin retains its data. Reusable implementation utilities must be published through declared package exports and tested outside this repository; no plugin may import a sibling's implementation.

## Capability and acceptance inventory

| Area | Owner | Acceptance evidence required |
|---|---|---|
| User preferences, global facts, branch-aware context, revisions | Runtime Source; project context Source | Scope and branch isolation; archive/restore; only approved context appears |
| Project/day journals, feedback, timestamps, date search | Journal Source | Durable entries, filtered retrieval, next-turn visibility |
| Personal/work/project/day tasks, priorities, deadlines, history | Tasks Source | Propose/edit/approve, status transitions, due view, project isolation |
| Reusable skills, prompt library, categories, enablement, schedules | Playbooks Source; prompt policy enhancement | Review before activation, bounded discovery, scheduled use, stop and persistence |
| Review proposals, deduplication, repeated signals, archive | Owning Sources; review policy enhancement | Candidates never enter active context; revision-fenced decisions |
| File name/content search and imported session history | Files and session Sources | Explicit roots, bounded reads, cancellation, malformed input and path rejection |
| Bookmarks, turn navigation, session branching and names | Session Source and DSH adapter | Real session integration, correct selected turn and scoped history |
| Session teams, messages, presence, file reservations | Collaboration Source and DSH adapter | Directed recipients, room membership, wake behavior and conflicts |
| External agent adapters, async jobs, logs, cancellation, attachments | Agent Jobs Source | No shell interpolation; bounded jobs; accurate completion and resumability |
| Independent conversation review and layered constraints | Review Source and review enhancement | Visible conversation only; provenance-preserving feedback; reset and history |
| Notes, files, media and spatial board | Canvas Source | Scope filtering, placement, pan/zoom, registered asset reads and invalid-file display |
| Local and configured channel notifications | Notifications Source and DSH adapter | Unread state, session navigation, explicit send authority and attachment checks |
| Cross-device memory snapshots and conflict resolution | Sync Source and explicit export/import coordination | Three-way merge, project identity, no automatic push, local/remote/both resolution |
| Model metadata, context usage, session filters, responsive layout | DSH public UI integration | Existing model configuration remains authoritative; desktop/mobile screenshots |
| Version checks and installed plugin updates | Existing Host plugin management | Independent package metadata and profile-owned updates |

## Delivery and verification

1. Create an independent worktree from committed `main`, install its dependencies, and boot a retained DSH profile with an isolated Mnemon binary and data directory.
2. Add Source utilities, plugin packages and the explicit workspace Strategy in reviewable commits. Exercise real Core composition, source isolation, stale revisions, denial and unload/reload.
3. Connect lifecycle and DSH services only through published interfaces. External operations require separate authorization; automated review remains attributed to the reviewer.
4. Build the package graph, run complete repository verification and isolated artifact verification, then exercise meaningful WebUI workflows with synthetic data and retained screenshots.
5. Record actual results and limitations in bilingual documentation. A deterministic local model validates orchestration mechanics, not model accuracy or real third-party service availability.

## Development instance

`scripts/serve-workspace.mjs` accepts `--state-dir`, `--mnemon`, `--port` and `--model fixture|configured`. It copies the selected executable into the independent state directory, isolates `DSH_HOME` and `MNEMON_DATA_DIR`, retains logs and data on shutdown, and supports a DSH restart via `SIGUSR2`. The default fixture model listens on loopback; configured mode uses the caller's existing model environment without copying credentials into files.

Mnemon Native executes the real `mnemon` CLI on demand. It does not require a permanent daemon. Native store operations and WebUI access must both be verified.
