---
"dsh-mnemon": patch
---

Autonomous write workers (distillation and supervised writeback) no longer receive `mnemon_forget` in their hard tool allowlist: duplicates and conflicts are resolved by skipping or storing corrected entries instead of deleting existing memories. Explicit user operations (`/mnemon forget`, `mnemon_link`, Memory Space management) keep the full write toolset, and the main agent can still call `mnemon_forget` directly. Closes #148.
