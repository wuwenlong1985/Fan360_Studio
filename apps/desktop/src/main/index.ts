import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { Socket } from 'node:net'
import { DEVICE_CHANNELS, type DeviceStatus, type TcpConnectRequest, type TcpConnectResult } from '../shared/device'

let mainWindow: BrowserWindow | null = null
let deviceSocket: Socket | null = null
let deviceStatus: DeviceStatus = {
  state: 'disconnected',
  message: '尚未连接设备',
  timestamp: Date.now(),
}

function emitStatus(next: DeviceStatus) {
  deviceStatus = next
  mainWindow?.webContents.send(DEVICE_CHANNELS.status, next)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#05090f',
    title: 'Fan360 Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-finish-load', () => console.log('[main] renderer loaded'))
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[main] renderer failed to load: ${code} ${description}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[main] renderer process gone: ${details.reason}`)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function closeCurrentSocket() {
  const socket = deviceSocket
  deviceSocket = null
  if (!socket || socket.destroyed) return
  socket.removeAllListeners()
  socket.end()
  socket.destroy()
}

function validateConnectRequest(request: TcpConnectRequest) {
  const host = request?.host?.trim()
  if (!host) throw new Error('请输入设备 IP')
  if (/[\s/]/.test(host)) throw new Error('设备 IP 格式不正确')
  if (request?.port !== 5000) throw new Error('TCP 端口固定为 5000')
  return host
}

async function connectTcp(request: TcpConnectRequest): Promise<TcpConnectResult> {
  let host: string
  try {
    host = validateConnectRequest(request)
  } catch (error) {
    const status: DeviceStatus = {
      state: 'error',
      host: request?.host,
      port: 5000,
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    }
    emitStatus(status)
    return { ok: false, status }
  }

  closeCurrentSocket()
  const connecting: DeviceStatus = {
    state: 'connecting',
    host,
    port: 5000,
    message: `正在连接 ${host}:5000`,
    timestamp: Date.now(),
  }
  emitStatus(connecting)

  return await new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 5000)
    socket.setTimeout(5000, () => {
      if (settled) return
      settled = true
      socket.destroy()
      const status: DeviceStatus = {
        state: 'error',
        host,
        port: 5000,
        message: '连接超时，请检查设备 IP 和网络',
        timestamp: Date.now(),
      }
      emitStatus(status)
      resolve({ ok: false, status })
    })

    socket.once('error', (error) => {
      if (settled) return
      settled = true
      socket.destroy()
      const status: DeviceStatus = {
        state: 'error',
        host,
        port: 5000,
        message: error.message || 'TCP 连接失败',
        timestamp: Date.now(),
      }
      emitStatus(status)
      resolve({ ok: false, status })
    })

    socket.once('connect', () => {
      settled = true
      socket.setTimeout(0)
      deviceSocket = socket
      const status: DeviceStatus = {
        state: 'connected',
        host,
        port: 5000,
        message: `已连接 ${host}:5000`,
        timestamp: Date.now(),
      }
      emitStatus(status)
      resolve({ ok: true, status })

      socket.on('close', () => {
        if (deviceSocket === socket) deviceSocket = null
        if (deviceStatus.state === 'connected' || deviceStatus.state === 'connecting') {
          emitStatus({
            state: 'disconnected',
            host,
            port: 5000,
            message: '设备连接已断开',
            timestamp: Date.now(),
          })
        }
      })
    })

    socket.connect({ host, port: 5000 })
  })
}

function disconnectTcp(): DeviceStatus {
  const host = deviceStatus.host
  closeCurrentSocket()
  const status: DeviceStatus = {
    state: 'disconnected',
    host,
    port: 5000,
    message: '已断开设备连接',
    timestamp: Date.now(),
  }
  emitStatus(status)
  return status
}

function registerIpc() {
  ipcMain.handle(DEVICE_CHANNELS.connect, (_event, request: TcpConnectRequest) => connectTcp(request))
  ipcMain.handle(DEVICE_CHANNELS.disconnect, () => disconnectTcp())
  ipcMain.handle(DEVICE_CHANNELS.getStatus, () => {
    console.log('[device] renderer requested TCP status')
    return deviceStatus
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeCurrentSocket()
  if (process.platform !== 'darwin') app.quit()
})
