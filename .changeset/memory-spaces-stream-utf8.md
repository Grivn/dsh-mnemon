---
"dsh-mnemon-source-memory-spaces": patch
"dsh-mnemon": patch
---

Preserve UTF-8 characters split across subprocess output chunks in the independent Memory Spaces Source and Host process runners. Keep output limits measured in raw bytes and flush each stream's decoder when the subprocess closes.
