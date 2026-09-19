export type DeviceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type DeviceStatus = {
  state: DeviceConnectionState
  host?: string
  port?: 5000
  message?: string
  timestamp: number
}

export type TcpConnectRequest = {
  host: string
  port: 5000
}

export type TcpConnectResult = {
  ok: boolean
  status: DeviceStatus
}

export type DeviceSyncState = 'idle' | 'preparing' | 'uploading' | 'committing' | 'success' | 'error'

export type DeviceSyncStatus = {
  state: DeviceSyncState
  transferredBytes: number
  totalBytes: number
  progress: number
  message: string
  timestamp: number
}

export type SyncFrameResult = {
  ok: boolean
  bytesSent: number
  message: string
}

export type DeviceApi = {
  getStatus: () => Promise<DeviceStatus>
  connect: (request: TcpConnectRequest) => Promise<TcpConnectResult>
  disconnect: () => Promise<DeviceStatus>
  syncFrame: (frame: Uint8Array) => Promise<SyncFrameResult>
  onStatus: (listener: (status: DeviceStatus) => void) => () => void
  onSyncStatus: (listener: (status: DeviceSyncStatus) => void) => () => void
}

export const DEVICE_CHANNELS = {
  connect: 'device:tcp:connect',
  disconnect: 'device:tcp:disconnect',
  getStatus: 'device:tcp:get-status',
  status: 'device:tcp:status',
  syncFrame: 'device:sync:frame',
  syncStatus: 'device:sync:status',
} as const
