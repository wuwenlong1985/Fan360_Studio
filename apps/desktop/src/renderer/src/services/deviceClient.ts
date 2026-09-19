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
  exportFrames: async (frames) => ({ ok: false, message: `浏览器预览模式无法写入本地文件（${frames.length} 帧）` }),
  syncFrames: async (frames) => {
    await wait(250)
    return { ok: true, bytesSent: frames.reduce((total, frame) => total + frame.byteLength, 0), message: `浏览器预览模式：已模拟同步 ${frames.length} 帧` }
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
  onSyncStatus: () => () => undefined,
}

export const deviceApi: DeviceApi = window.fan360?.device ?? fallbackApi
