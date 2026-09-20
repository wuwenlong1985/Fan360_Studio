import { app, BrowserWindow, dialog, ipcMain, screen, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { Socket } from 'node:net'
import {
  CONTROL_MESSAGE_TYPE,
  ControlMessageDecoder,
  FRAME_BYTES,
  SECTOR_PACKET_BYTES,
  concatPacketPackets,
  crc32Frames,
  decodeSyncAckPayload,
  encodeControlMessage,
  encodeFanFile,
  encodeSyncBeginPayload,
  packFramesToPackets,
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
import { PROJECT_CHANNELS, type ProjectDocument } from '../shared/project'

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
  const { width: availableWidth, height: availableHeight } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(2080, availableWidth),
    height: Math.min(1000, availableHeight),
    minWidth: 1180,
    minHeight: 720,
    // Show the shell immediately: Canvas sizing needs a first paint, and a
    // hidden window can otherwise wait indefinitely for ready-to-show.
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f9',
    title: 'Fan360 Studio',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f3f5f9',
      symbolColor: '#25354b',
      height: 48,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

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

async function syncFramesToDevice(frames: Uint8Array[], fps: number): Promise<SyncFrameResult> {
  const socket = deviceSocket
  if (!socket || socket.destroyed || deviceStatus.state !== 'connected') {
    throw new Error('设备尚未连接')
  }
  if (syncInProgress) throw new Error('已有同步任务正在执行')
  if (frames.length < 1 || frames.length > 255) throw new RangeError('frameCount must be from 1 to 255')
  frames.forEach((frame) => {
    if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
  })
  if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new RangeError('fps must be from 0 to 60')

  syncInProgress = true
  const sequence = ++syncSequence >>> 0
  const packets = packFramesToPackets(frames, sequence & 0xffff)
  const packetStream = concatPacketPackets(packets)
  const payloadCrc32 = crc32Frames(frames)
  const baseFps = 1000 / 60
  const holdRevolutions = Math.max(1, Math.round(baseFps / fps))
  const fpsMilli = Math.round(fps * 1000)
  const begin = encodeControlMessage(
    CONTROL_MESSAGE_TYPE.SYNC_BEGIN,
    sequence,
    encodeSyncBeginPayload({
      frameCount: frames.length,
      frameBytes: FRAME_BYTES,
      sectorPacketBytes: SECTOR_PACKET_BYTES,
      holdRevolutions,
      payloadCrc32,
      totalPacketBytes: packetStream.byteLength,
      fpsMilli,
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
      message: `正在准备 ${frames.length} 帧 × 360 组角度数据`,
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
      message: `正在传输 ${frames.length} 帧角度数据`,
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
  ipcMain.handle(DEVICE_CHANNELS.syncFrames, (_event, frames: Uint8Array[], fps: number) => syncFramesToDevice(frames, fps))
  ipcMain.handle(PROJECT_CHANNELS.save, async (_event, document: ProjectDocument) => {
    let filePath = process.env.FAN360_PROJECT_SAVE_PATH
    if (!filePath) {
      const options: SaveDialogOptions = {
        title: '保存 Fan360 项目',
        defaultPath: 'fan360-project.fanproj',
        filters: [{ name: 'Fan360 Project', extensions: ['fanproj', 'json'] }],
      }
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { ok: false, message: '已取消保存' }
      filePath = result.filePath
    }
    await writeFile(filePath, JSON.stringify({ ...document, version: 1, savedAt: new Date().toISOString() }, null, 2), 'utf8')
    return { ok: true, path: filePath, message: '项目保存成功' }
  })

  ipcMain.handle(PROJECT_CHANNELS.load, async () => {
    let filePath = process.env.FAN360_PROJECT_LOAD_PATH
    if (!filePath) {
      const options: OpenDialogOptions = {
        title: '打开 Fan360 项目',
        filters: [{ name: 'Fan360 Project', extensions: ['fanproj', 'json'] }],
        properties: ['openFile'],
      }
      const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消打开' }
      filePath = result.filePaths[0]
    }
    const document = JSON.parse(await readFile(filePath, 'utf8')) as ProjectDocument
    if (document.version !== 1 || typeof document.selectedSceneId !== 'string') {
      return { ok: false, message: '不支持的项目文件格式' }
    }
    return { ok: true, path: filePath, document, message: '项目打开成功' }
  })

  ipcMain.handle(DEVICE_CHANNELS.importModel, async () => {
    let filePaths: string[] | undefined
    if (process.env.FAN360_IMPORT_MODEL_PATH) {
      filePaths = process.env.FAN360_IMPORT_MODEL_PATH.split(';').filter(Boolean).map((item) => resolve(item))
    } else {
      const options: OpenDialogOptions = {
        title: '导入 GLB 或 glTF 模型',
        filters: [{ name: 'glTF Model', extensions: ['glb', 'gltf', 'bin', 'png', 'jpg', 'jpeg', 'webp'] }],
        properties: ['openFile', 'multiSelections'],
      }
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return { ok: false, message: '已取消导入' }
      filePaths = result.filePaths
    }

    const mainPath = filePaths.find((filePath) => /\.(glb|gltf)$/i.test(filePath))
    if (!mainPath) return { ok: false, message: '请选择 .glb 或 .gltf 主模型文件' }
    const baseDir = dirname(mainPath)
    const mimeByExtension: Record<string, string> = {
      glb: 'model/gltf-binary',
      gltf: 'model/gltf+json',
      bin: 'application/octet-stream',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    }
    const files = []
    let totalBytes = 0
    for (const filePath of filePaths) {
      const data = await readFile(filePath)
      totalBytes += data.byteLength
      if (totalBytes > 150 * 1024 * 1024) return { ok: false, message: '模型资源总大小不能超过 150 MB' }
      const name = basename(filePath)
      const extension = name.split('.').pop()?.toLowerCase() ?? ''
      files.push({
        name,
        relativePath: relative(baseDir, filePath).replaceAll('\\', '/') || name,
        mime: mimeByExtension[extension] ?? 'application/octet-stream',
        data: new Uint8Array(data),
      })
    }
    return { ok: true, mainFile: basename(mainPath), files, message: '3D 模型资源导入成功' }
  })

  ipcMain.handle(DEVICE_CHANNELS.exportFrames, async (_event, frames: Uint8Array[], fps: number) => {
    if (frames.length < 1 || frames.length > 255 || frames.some((frame) => frame.byteLength !== FRAME_BYTES)) {
      return { ok: false, message: `每帧必须为 ${FRAME_BYTES} B，帧数必须为 1 到 255` }
    }
    let filePath = process.env.FAN360_EXPORT_PATH
    if (!filePath) {
      const options: SaveDialogOptions = {
        title: '导出 Fan360 帧',
        defaultPath: 'fan360-frame.fan360',
        filters: [{ name: 'Fan360 Frame', extensions: ['fan360'] }],
      }
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出' }
      filePath = result.filePath
    }
    await writeFile(filePath, encodeFanFile(frames, { fps }))
    return { ok: true, path: filePath, message: 'Fan360 帧导出成功' }
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
