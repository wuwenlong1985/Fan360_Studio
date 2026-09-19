import type { DeviceApi, DeviceStatus, TcpConnectRequest } from '../../../shared/device'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const fallbackApi: DeviceApi = {
  getStatus: async () => ({
    state: 'disconnected',
    port: 5000,
    message: '浏览器预览模式：尚未连接设备',
    timestamp: Date.now(),
  }),
  connect: async (request: TcpConnectRequest) => {
    await wait(350)
    const status: DeviceStatus = {
      state: 'connected',
      host: request.host,
      port: 5000,
      message: `浏览器预览模式：模拟连接 ${request.host}:5000`,
      timestamp: Date.now(),
    }
    return { ok: true, status }
  },
  disconnect: async () => {
    await wait(150)
    return {
      state: 'disconnected',
      port: 5000,
      message: '浏览器预览模式：已断开',
      timestamp: Date.now(),
    }
  },
  onStatus: () => () => undefined,
}

export const deviceApi: DeviceApi = window.fan360?.device ?? fallbackApi
