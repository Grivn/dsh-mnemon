import type { CreateMemorySpaceRequest, EntityView, Insight, MemorySpace, MemorySpaceView, MemorySpaceMetadataMaintenanceResult, MemorySpaceCatalog, MemoryGraphSnapshot, MemoryListRequest, MemoryListView, MemoryReadSource, RememberRequest, SearchRequest, UpdateMemorySpaceRequest } from '../contracts.ts'

/**
 * Source-owned structural page API; the default bundle may supply agent-assisted callbacks.
 * body/bodies method and wire-field spellings remain compatible with existing
 * v0.5.x page clients. All of them operate on the canonical MemorySpace model.
 */
export interface MemorySpacesPageClient {
  bodies(): Promise<MemorySpaceCatalog>
  bodyDirectory(): Promise<MemorySpaceCatalog>
  graph(memoryBodyIds?: string[]): Promise<MemoryGraphSnapshot>
  list(request?: MemoryListRequest): Promise<MemoryListView>
  entities(entity?: string, limit?: number): Promise<EntityView>
  search(request: SearchRequest): Promise<SearchResponse>
  agentSearch(request: SearchRequest): Promise<AgentSearchResponse>
  related(id: string, memoryBodyId?: string): Promise<Insight[]>
  remember(request: RememberRequest): Promise<Record<string, unknown>>
  supervise(content: string, idempotencyKey?: string): Promise<{ delegated: true; sessionId: string; runId: string; provider: string; summary: string; action: string; memoryBodyIds: string[] }>
  forget(id: string, memoryBodyId?: string): Promise<Record<string, unknown>>
  createBody(request: CreateMemorySpaceRequest): Promise<MemorySpace>
  updateBody(memoryBodyId: string, request: UpdateMemorySpaceRequest): Promise<MemorySpace>
  reconnectBody(memoryBodyId: string): Promise<MemorySpaceView>
  maintainBodyMetadata(memoryBodyIds: string[]): Promise<MemorySpaceMetadataMaintenanceResult>
  deleteBody(memoryBodyId: string): Promise<MemorySpace>
}

export interface SearchResponse { results: Insight[]; sources?: MemoryReadSource[] }
export interface AgentSearchResponse extends SearchResponse { answer: string; citations: string[]; delegation: { runId: string } }
