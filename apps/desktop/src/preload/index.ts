import { contextBridge, ipcRenderer } from 'electron'
import { DEVICE_CHANNELS, type DeviceApi, type DeviceStatus, type DeviceSyncStatus, type TcpConnectRequest } from '../shared/device'

const deviceApi: DeviceApi = {
  getStatus: () => ipcRenderer.invoke(DEVICE_CHANNELS.getStatus),
  connect: (request: TcpConnectRequest) => ipcRenderer.invoke(DEVICE_CHANNELS.connect, request),
  disconnect: () => ipcRenderer.invoke(DEVICE_CHANNELS.disconnect),
  syncFrame: (frame) => ipcRenderer.invoke(DEVICE_CHANNELS.syncFrame, frame),
  onStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DeviceStatus) => listener(status)
    ipcRenderer.on(DEVICE_CHANNELS.status, handler)
    return () => ipcRenderer.removeListener(DEVICE_CHANNELS.status, handler)
  },
  onSyncStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DeviceSyncStatus) => listener(status)
    ipcRenderer.on(DEVICE_CHANNELS.syncStatus, handler)
    return () => ipcRenderer.removeListener(DEVICE_CHANNELS.syncStatus, handler)
  },
}

contextBridge.exposeInMainWorld('fan360', {
  device: deviceApi,
})
