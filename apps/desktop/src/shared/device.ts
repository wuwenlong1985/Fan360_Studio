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

export type DeviceApi = {
  getStatus: () => Promise<DeviceStatus>
  connect: (request: TcpConnectRequest) => Promise<TcpConnectResult>
  disconnect: () => Promise<DeviceStatus>
  onStatus: (listener: (status: DeviceStatus) => void) => () => void
}

export const DEVICE_CHANNELS = {
  connect: 'device:tcp:connect',
  disconnect: 'device:tcp:disconnect',
  getStatus: 'device:tcp:get-status',
  status: 'device:tcp:status',
} as const
