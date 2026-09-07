import {
  MNEMON_ACTIVATION_CHANNEL,
  MNEMON_PACK_CHANNEL,
  MNEMON_READ_CHANNEL,
  MNEMON_REMOTE_ACTIVATION_ENDPOINT,
  MNEMON_REMOTE_CHANNEL,
  MNEMON_REMOTE_PACK_ENDPOINT,
  MNEMON_REMOTE_READ_ENDPOINT,
  MNEMON_REMOTE_SETTINGS_ENDPOINT,
  MNEMON_REMOTE_VIEW_ENDPOINT,
  MNEMON_REMOTE_VIEW_WRITE_ENDPOINT,
  MNEMON_REMOTE_WRITE_ENDPOINT,
  MNEMON_SETTINGS_CHANNEL,
  MNEMON_VIEW_CHANNEL,
  MNEMON_VIEW_WRITE_CHANNEL,
  MNEMON_WRITE_CHANNEL,
  type ClientConnectionHandle,
} from '../host/protocol.ts'

type ClientRpcResult = Awaited<ReturnType<ClientConnectionHandle['rpc']['call']>>

const REMOTE_ENDPOINT = new Map<string, string>([
  [MNEMON_READ_CHANNEL, MNEMON_REMOTE_READ_ENDPOINT],
  [MNEMON_ACTIVATION_CHANNEL, MNEMON_REMOTE_ACTIVATION_ENDPOINT],
  [MNEMON_WRITE_CHANNEL, MNEMON_REMOTE_WRITE_ENDPOINT],
  [MNEMON_PACK_CHANNEL, MNEMON_REMOTE_PACK_ENDPOINT],
  [MNEMON_SETTINGS_CHANNEL, MNEMON_REMOTE_SETTINGS_ENDPOINT],
  [MNEMON_VIEW_CHANNEL, MNEMON_REMOTE_VIEW_ENDPOINT],
  [MNEMON_VIEW_WRITE_CHANNEL, MNEMON_REMOTE_VIEW_WRITE_ENDPOINT],
])

function isClientRpcResult(value: unknown): value is ClientRpcResult {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, 'ok')) return false
  const candidate = value as { ok?: unknown; value?: unknown; error?: unknown }
  if (candidate.ok === true) return Object.hasOwn(candidate, 'value')
  if (candidate.ok !== false || typeof candidate.error !== 'object' || candidate.error === null) return false
  return typeof (candidate.error as { message?: unknown }).message === 'string'
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isRemoteConnection(connection: ClientConnectionHandle): boolean {
  const hostname = globalThis.location?.hostname
  const remotePage = typeof hostname === 'string' && hostname !== '' && !isLoopbackHostname(hostname)
  return remotePage || connection.isLoopback === false
}

/** Route only paired remote pages through API Gateway; local clients retain legacy channels. */
export async function callMnemonRpc(
  connection: ClientConnectionHandle,
  channel: string,
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<ClientRpcResult> {
  const remoteEndpoint = REMOTE_ENDPOINT.get(channel)
  if (!isRemoteConnection(connection) || remoteEndpoint === undefined) {
    return signal === undefined
      ? connection.rpc.call(channel, endpoint, payload)
      : connection.rpc.call(channel, endpoint, payload, signal)
  }
  const remotePayload = { args: { endpoint, payload } }
  const response = await (signal === undefined
    ? connection.rpc.call(MNEMON_REMOTE_CHANNEL, remoteEndpoint, remotePayload)
    : connection.rpc.call(MNEMON_REMOTE_CHANNEL, remoteEndpoint, remotePayload, signal))
  if (!response.ok) return response
  if (!isClientRpcResult(response.value)) throw new Error('DSH API Gateway returned an invalid Mnemon response')
  return response.value
}
