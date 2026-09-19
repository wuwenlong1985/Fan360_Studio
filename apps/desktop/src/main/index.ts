import { app, BrowserWindow, ipcMain } from 'electron'
import { once } from 'node:events'
import { join } from 'node:path'
import { Socket } from 'node:net'
import {
  CONTROL_MESSAGE_TYPE,
  ControlMessageDecoder,
  FRAME_BYTES,
  SECTOR_PACKET_BYTES,
  concatPacketPackets,
  crc32,
  decodeSyncAckPayload,
  encodeControlMessage,
  encodeSyncBeginPayload,
  packFrameToPackets,
  type SyncAckInfo,
} from '@fan360/core'
import {
  DEVICE_CHANNELS,
  type DeviceStatus,
  type DeviceSyncStatus,
  type SyncFrameResult,
  type TcpConnectRequest,
  type TcpConnectResult,
} from '../shared/device'

let mainWindow: BrowserWindow | null = null
let deviceSocket: Socket | null = null
let deviceStatus: DeviceStatus = {
  state: 'disconnected',
  message: '尚未连接设备',
  timestamp: Date.now(),
}
let controlDecoder = new ControlMessageDecoder()
let pendingAck:
  | {
      resolve: (ack: SyncAckInfo) => void
      reject: (error: Error) => void
      timer: NodeJS.Timeout
    }
  | undefined
let syncInProgress = false
let syncSequence = 0

function emitStatus(next: DeviceStatus) {
  deviceStatus = next
  mainWindow?.webContents.send(DEVICE_CHANNELS.status, next)
}

function emitSyncStatus(next: DeviceSyncStatus) {
  mainWindow?.webContents.send(DEVICE_CHANNELS.syncStatus, next)
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

function rejectPendingAck(error: Error) {
  if (!pendingAck) return
  clearTimeout(pendingAck.timer)
  pendingAck.reject(error)
  pendingAck = undefined
}

function closeCurrentSocket() {
  const socket = deviceSocket
  deviceSocket = null
  rejectPendingAck(new Error('设备连接已关闭'))
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

function handleDeviceData(chunk: Buffer) {
  try {
    for (const message of controlDecoder.push(new Uint8Array(chunk))) {
      if (message.type === CONTROL_MESSAGE_TYPE.SYNC_ACK && pendingAck) {
        const ack = decodeSyncAckPayload(message.payload)
        clearTimeout(pendingAck.timer)
        pendingAck.resolve(ack)
        pendingAck = undefined
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    rejectPendingAck(new Error(message))
    emitSyncStatus({
      state: 'error',
      transferredBytes: 0,
      totalBytes: 0,
      progress: 0,
      message,
      timestamp: Date.now(),
    })
  }
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
  controlDecoder = new ControlMessageDecoder()
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
      socket.on('data', handleDeviceData)
      socket.on('error', (error) => {
        const message = error.message || '设备连接异常'
        rejectPendingAck(new Error(message))
        emitStatus({
          state: 'error',
          host,
          port: 5000,
          message,
          timestamp: Date.now(),
        })
      })

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
        rejectPendingAck(new Error('设备连接已断开'))
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
  syncInProgress = false
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

function waitForSyncAck(timeoutMs = 8000): Promise<SyncAckInfo> {
  if (pendingAck) throw new Error('已有同步任务正在等待设备响应')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAck = undefined
      reject(new Error('等待设备 SYNC_ACK 超时'))
    }, timeoutMs)
    pendingAck = { resolve, reject, timer }
  })
}

async function writeChunked(
  socket: Socket,
  data: Uint8Array,
  status: {
    transferredBefore: number
    totalBytes: number
    state: DeviceSyncStatus['state']
    message: string
  },
) {
  const chunkSize = 16 * 1024
  let offset = 0
  while (offset < data.byteLength) {
    const end = Math.min(offset + chunkSize, data.byteLength)
    const chunk = Buffer.from(data.subarray(offset, end))
    if (!socket.write(chunk)) await once(socket, 'drain')
    offset = end
    const transferredBytes = status.transferredBefore + offset
    emitSyncStatus({
      state: status.state,
      transferredBytes,
      totalBytes: status.totalBytes,
      progress: Math.min(99, Math.round((transferredBytes / status.totalBytes) * 100)),
      message: status.message,
      timestamp: Date.now(),
    })
  }
}

async function syncFrameToDevice(frame: Uint8Array): Promise<SyncFrameResult> {
  const socket = deviceSocket
  if (!socket || socket.destroyed || deviceStatus.state !== 'connected') {
    throw new Error('设备尚未连接')
  }
  if (syncInProgress) throw new Error('已有同步任务正在执行')
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)

  syncInProgress = true
  const sequence = ++syncSequence >>> 0
  const packets = packFrameToPackets(frame, sequence & 0xffff)
  const packetStream = concatPacketPackets(packets)
  const begin = encodeControlMessage(
    CONTROL_MESSAGE_TYPE.SYNC_BEGIN,
    sequence,
    encodeSyncBeginPayload({
      frameCount: 1,
      frameBytes: FRAME_BYTES,
      sectorPacketBytes: SECTOR_PACKET_BYTES,
      payloadCrc32: crc32(frame),
      totalPacketBytes: packetStream.byteLength,
    }),
  )
  const commit = encodeControlMessage(CONTROL_MESSAGE_TYPE.SYNC_COMMIT, sequence)
  const play = encodeControlMessage(CONTROL_MESSAGE_TYPE.PLAY, sequence)
  const totalBytes = begin.byteLength + packetStream.byteLength + commit.byteLength + play.byteLength

  try {
    emitSyncStatus({
      state: 'preparing',
      transferredBytes: 0,
      totalBytes,
      progress: 0,
      message: '正在准备 360 组角度数据',
      timestamp: Date.now(),
    })
    const ackPromise = waitForSyncAck()
    await writeChunked(socket, begin, {
      transferredBefore: 0,
      totalBytes,
      state: 'preparing',
      message: '正在发送 SYNC_BEGIN',
    })
    await writeChunked(socket, packetStream, {
      transferredBefore: begin.byteLength,
      totalBytes,
      state: 'uploading',
      message: '正在传输 360 组角度数据',
    })
    emitSyncStatus({
      state: 'committing',
      transferredBytes: begin.byteLength + packetStream.byteLength,
      totalBytes,
      progress: 98,
      message: '正在提交并等待设备校验',
      timestamp: Date.now(),
    })
    socket.write(Buffer.from(commit))
    const ack = await ackPromise
    if (!ack.accepted) throw new Error(`设备拒绝同步，错误码 ${ack.errorCode}`)
    socket.write(Buffer.from(play))
    emitSyncStatus({
      state: 'success',
      transferredBytes: totalBytes,
      totalBytes,
      progress: 100,
      message: '同步完成，设备已恢复显示',
      timestamp: Date.now(),
    })
    return { ok: true, bytesSent: totalBytes, message: '同步完成，设备已恢复显示' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!socket.destroyed) {
      socket.write(Buffer.from(encodeControlMessage(CONTROL_MESSAGE_TYPE.SYNC_ABORT, sequence)))
    }
    emitSyncStatus({
      state: 'error',
      transferredBytes: 0,
      totalBytes,
      progress: 0,
      message,
      timestamp: Date.now(),
    })
    return { ok: false, bytesSent: 0, message }
  } finally {
    syncInProgress = false
  }
}

function registerIpc() {
  ipcMain.handle(DEVICE_CHANNELS.connect, (_event, request: TcpConnectRequest) => connectTcp(request))
  ipcMain.handle(DEVICE_CHANNELS.disconnect, () => disconnectTcp())
  ipcMain.handle(DEVICE_CHANNELS.getStatus, () => {
    console.log('[device] renderer requested TCP status')
    return deviceStatus
  })
  ipcMain.handle(DEVICE_CHANNELS.syncFrame, (_event, frame: Uint8Array) => syncFrameToDevice(frame))
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
