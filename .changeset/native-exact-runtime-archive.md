---
"dsh-mnemon-provider-mnemon-native": patch
---

Preserve distinct but similar Runtime facts during Native bulk archival. Reuse only exact content from a readonly namespace snapshot, deduplicate identical entries within the batch, and import the remaining originals with semantic deduplication disabled. Keep ordinary remember behavior and storage formats unchanged, and validate every import receipt before allowing Runtime compaction.
