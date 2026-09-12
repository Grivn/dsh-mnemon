import type { MemoryOperationScope } from 'dsh-mnemon/contracts'

/** A completed, durable fact published by its owning Source, never an execution command. */
export interface WorkspaceActivity {
  eventKey: string
  sourceInstanceKey: string
  scope: MemoryOperationScope
  kind: string
  title: string
  summary: string
  level: 'info' | 'warning' | 'error'
  recordId?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Optional observers keep their own ledgers and deduplicate eventKey. @mode emit */
    'mnemon-workspace/activity'(activity: Readonly<WorkspaceActivity>): void
  }
}
