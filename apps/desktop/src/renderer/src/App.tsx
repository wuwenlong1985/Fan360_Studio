import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { ProceduralScene } from './scenes/ProceduralScene'
import { applyBloom, rgbaToFanFrame } from '@fan360/core'
import { sceneCatalog as scenes, type SceneItem } from './scenes/sceneCatalog'
import { ACESFilmicToneMapping, Color, LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, WebGLRenderTarget } from 'three'
import studioEnvironment from '@pmndrs/assets/hdri/studio.exr.js'
import { deviceApi } from './services/deviceClient'
import { projectApi, type ProjectDocument } from './services/projectClient'
import type { DeviceStatus, DeviceSyncStatus, ImportModelResult } from '../../shared/device'
import {
  CloudUploadOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  FolderOpenOutlined,
  FullscreenOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
  WifiOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Layout,
  Progress,
  Row,
  Popover,
  Select,
  Slider,
  Space,
  Statistic,
  Switch,
  Collapse,
  Tag,
  Tooltip,
  Typography,
} from 'antd'

const { Sider, Content } = Layout
const { Text, Title } = Typography

function PolarCapture({
  playing,
  brightness,
  bloomEnabled,
  bloomStrength,
  onFrame,
  onStats,
}: {
  playing: boolean
  brightness: number
  bloomEnabled: boolean
  bloomStrength: number
  onFrame: (frame: Uint8Array) => void
  onStats: (processingMs: number) => void
}) {
  const { gl, scene, camera } = useThree()
  const size = 768
  const target = useMemo(
    () =>
      new WebGLRenderTarget(size, size, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        type: UnsignedByteType,
        colorSpace: SRGBColorSpace,
      }),
    [],
  )
  const pixels = useMemo(() => new Uint8Array(size * size * 4), [])
  const captureBackground = useMemo(() => new Color('#000000'), [])
  const workerRef = useRef<Worker | null>(null)
  const workerFailed = useRef(false)
  const workerBusy = useRef(false)
  const requestId = useRef(0)
  const lastCapture = useRef(0)
  const onFrameRef = useRef(onFrame)
  const onStatsRef = useRef(onStats)
  onFrameRef.current = onFrame
  onStatsRef.current = onStats

  useEffect(() => {
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./workers/polar.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = (event: MessageEvent<{ id: number; frame?: ArrayBuffer; processingMs?: number; error?: string }>) => {
        workerBusy.current = false
        if (event.data.frame) onFrameRef.current(new Uint8Array(event.data.frame))
        if (typeof event.data.processingMs === 'number') onStatsRef.current(event.data.processingMs)
        if (event.data.error) console.error('[polar-worker]', event.data.error)
      }
      worker.onerror = (event) => {
        console.error('[polar-worker] worker failed, using synchronous fallback', event.message)
        workerFailed.current = true
        workerBusy.current = false
        worker?.terminate()
        workerRef.current = null
      }
    } catch (error) {
      workerFailed.current = true
      console.error('[polar-worker] unable to create worker, using synchronous fallback', error)
    }
    return () => {
      worker?.terminate()
      workerRef.current = null
      target.dispose()
    }
  }, [target])

  // A positive priority disables R3F's screen render. Capture device frames at
  // the default priority so R3F still draws the viewport on every animation frame.
  useFrame((state) => {
    const interval = playing ? 0.25 : 1
    if (workerBusy.current || state.clock.elapsedTime - lastCapture.current < interval) return
    lastCapture.current = state.clock.elapsedTime
    const previousTarget = gl.getRenderTarget()
    const previousBackground = scene.background
    const stage = scene.getObjectByName('studio-stage')
    const stageVisible = stage?.visible ?? false
    try {
      // The studio floor is an editing aid. Fan output needs a black background.
      if (stage) stage.visible = false
      scene.background = captureBackground
      gl.setRenderTarget(target)
      gl.render(scene, camera)
      gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    } finally {
      gl.setRenderTarget(previousTarget)
      scene.background = previousBackground
      if (stage) stage.visible = stageVisible
    }
    if (workerFailed.current || !workerRef.current) {
      const processed = bloomEnabled ? applyBloom(pixels, size, size, { threshold: 0.62, strength: bloomStrength, radius: 6, downsample: 4 }) : pixels
      onFrameRef.current(rgbaToFanFrame({ data: processed, width: size, height: size, flipY: true }, { radius: size * 0.46, brightness: brightness / 100, gamma: 1, sampling: 'bilinear' }))
      return
    }
    const transferable = pixels.slice().buffer
    workerBusy.current = true
    workerRef.current.postMessage(
      {
        id: ++requestId.current,
        pixels: transferable,
        width: size,
        height: size,
        options: { radius: size * 0.46, brightness: brightness / 100, gamma: 1, sampling: 'bilinear', bloom: bloomEnabled ? { threshold: 0.62, strength: bloomStrength, radius: 6, downsample: 4 } : undefined },
      },
      [transferable],
    )
  })

  return null
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[scene-error]', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <group>
          <mesh>
            <icosahedronGeometry args={[0.9, 1]} />
            <meshStandardMaterial color="#2475ed" wireframe emissive="#7fb1f5" emissiveIntensity={0.6} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.35, 0.025, 10, 100]} />
            <meshBasicMaterial color="#7fb1f5" />
          </mesh>
        </group>
      )
    }
    return this.props.children
  }
}

class WebGLErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('[webgl-error]', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="webgl-fallback">
          <ThunderboltOutlined />
          <strong>3D 渲染初始化失败</strong>
          <span>请检查显卡驱动或关闭远程桌面后重新启动应用。</span>
        </div>
      )
    }
    return this.props.children
  }
}

function SceneStage() {
  return (
    <group name="studio-stage">
      <mesh receiveShadow position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#14181d" roughness={0.84} metalness={0.06} />
      </mesh>
    </group>
  )
}

function EditorScene({ scene, playing, speed, cameraAngle, brightness, bloomEnabled, bloomStrength, onPolarFrame, onPolarStats, modelAsset }: { scene: SceneItem; playing: boolean; speed: number; cameraAngle: number; brightness: number; bloomEnabled: boolean; bloomStrength: number; onPolarFrame: (frame: Uint8Array) => void; onPolarStats: (processingMs: number) => void; modelAsset?: ImportModelResult | null }) {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: [0, 0.25, 5.8], fov: 38 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.domElement.dataset.webglReady = 'true'
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <color attach="background" args={['#11151b']} />
      <fog attach="fog" args={['#11151b', 10, 24]} />
      <SceneStage />
      <Suspense fallback={null}>
        <Environment files={studioEnvironment} environmentIntensity={0.5} environmentRotation={[0, Math.PI / 3, 0]} />
      </Suspense>
      <ambientLight intensity={0.18} />
      <directionalLight position={[-3, 5, 4]} color="#fff2df" intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.03} />
      <directionalLight position={[4, 1, 2]} color="#dce8ff" intensity={0.6} />
      <directionalLight position={[1, 4, -4]} color="#ffffff" intensity={1.8} />
        <group rotation={[0.08, (cameraAngle * Math.PI) / 180, 0]}>
          <SceneErrorBoundary key={scene.id}>
            <Suspense fallback={null}>
              <ProceduralScene
                sceneId={scene.id}
                modelAsset={modelAsset}
                accent={scene.accent}
                second={scene.second}
                playing={playing}
                speed={speed}
              />
            </Suspense>
          </SceneErrorBoundary>
        </group>
      <PolarCapture playing={playing} brightness={brightness} bloomEnabled={bloomEnabled} bloomStrength={bloomStrength} onFrame={onPolarFrame} onStats={onPolarStats} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.7}
        maxDistance={9}
        minPolarAngle={0.55}
        maxPolarAngle={2.35}
      />
    </Canvas>
  )
}

function useCanvasFrame(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  callback: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => void,
) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    let disposed = false
    let lastWidth = 0
    let lastHeight = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      canvas.width = width
      canvas.height = height
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    window.addEventListener('resize', resize)
    const resizeTimer = window.setTimeout(resize, 0)
    const render = (time: number) => {
      if (disposed) return
      callback(ctx, canvas.clientWidth, canvas.clientHeight, time)
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', resize)
    }
  }, [canvasRef, callback])
}

function buildPolarPreview(frame: Uint8Array, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, size, size)
  const center = size / 2
  const maxRadius = size * 0.49
  for (let angle = 0; angle < 360; angle += 1) {
    const theta = (angle * Math.PI) / 180
    for (let led = 0; led < 80; led += 1) {
      const offset = angle * 320 + led * 4
      const brightness = frame[offset] / 255
      if (brightness <= 0.002) continue
      const radius = ((led + 0.5) / 80) * maxRadius
      const x = center + Math.cos(theta) * radius
      const y = center + Math.sin(theta) * radius
      ctx.fillStyle = `rgba(${frame[offset + 1]}, ${frame[offset + 2]}, ${frame[offset + 3]}, ${brightness})`
      ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5)
    }
  }
  return canvas
}

function DevicePreview({ playing, speed, brightness, angle, frameRef }: { playing: boolean; speed: number; brightness: number; angle: number; frameRef: React.RefObject<Uint8Array | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({ playing, speed, brightness, angle, frameRef })
  const polarCache = useRef<{ frame: Uint8Array | null; canvas: HTMLCanvasElement | null }>({ frame: null, canvas: null })
  state.current = { playing, speed, brightness, angle, frameRef }

  useCanvasFrame(canvasRef, (ctx, width, height, time) => {
    const { playing: isPlaying, speed: currentSpeed, brightness: currentBrightness, angle: baseAngle, frameRef: currentFrameRef } = state.current
    const polarFrame = currentFrameRef.current
    canvasRef.current?.setAttribute('data-has-polar-frame', polarFrame ? 'true' : 'false')
    if (polarFrame && polarCache.current.frame !== polarFrame) {
      polarCache.current.frame = polarFrame
      polarCache.current.canvas = buildPolarPreview(polarFrame, 520)
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(320, width)
    const h = Math.max(220, height)
    const centerX = w * 0.3
    const centerY = h * 0.52
    const radius = Math.min(h * 0.39, w * 0.19)
    const sweep = isPlaying ? (time * 0.00055 * currentSpeed * 180) / Math.PI : baseAngle
    const radians = (sweep * Math.PI) / 180

    const bg = ctx.createLinearGradient(0, 0, w, h)
    bg.addColorStop(0, '#07101a')
    bg.addColorStop(1, '#03060a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.beginPath()
    ctx.arc(0, 0, radius + 16, 0, Math.PI * 2)
    ctx.fillStyle = '#020407'
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.clip()
    if (polarCache.current.canvas) {
      ctx.drawImage(polarCache.current.canvas, centerX - radius, centerY - radius, radius * 2, radius * 2)
    } else {
      const disk = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      disk.addColorStop(0, `rgba(44, 239, 255, ${0.18 + currentBrightness / 500})`)
      disk.addColorStop(0.35, `rgba(72, 76, 255, ${0.2 + currentBrightness / 460})`)
      disk.addColorStop(0.78, `rgba(255, 60, 195, ${0.16 + currentBrightness / 520})`)
      disk.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = disk
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)
    }

    ctx.globalAlpha = 0.22
    for (let ring = 1; ring <= 11; ring += 1) {
      ctx.beginPath()
      ctx.arc(centerX, centerY, (radius / 11) * ring, 0, Math.PI * 2)
      ctx.strokeStyle = ring % 2 ? '#2bd9ff' : '#a95cff'
      ctx.lineWidth = 0.75
      ctx.stroke()
    }
    ctx.globalAlpha = 0.16
    for (let step = 0; step < 360; step += 10) {
      const a = (step * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius)
      ctx.strokeStyle = '#79eaff'
      ctx.lineWidth = 0.55
      ctx.stroke()
    }

    for (let step = 0; step < 360; step += 3) {
      const a = (step * Math.PI) / 180
      const wave = (Math.sin(step * 0.057 + time * 0.002) + 1) / 2
      const alpha = 0.035 + wave * 0.08
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius)
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`
      ctx.lineWidth = 1.3
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = '#f8fbff'
    ctx.shadowColor = '#68ecff'
    ctx.shadowBlur = 14
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(centerX + Math.cos(radians) * radius, centerY + Math.sin(radians) * radius)
    ctx.stroke()
    ctx.restore()

    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.strokeStyle = '#4be4ff'
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#b8d8e7'
    ctx.font = '600 11px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText('真实设备圆盘预览', centerX - radius, centerY - radius - 22)
    ctx.fillStyle = '#5c8195'
    ctx.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(`360° × 80 LED · 扫描角度 ${Math.round((sweep + 360) % 360)}°`, centerX - radius, centerY + radius + 23)

    const matrixX = w * 0.57
    const matrixY = 38
    const matrixW = w * 0.38
    const matrixH = h - 76
    ctx.fillStyle = '#09131d'
    ctx.strokeStyle = '#1d3448'
    ctx.lineWidth = 1
    ctx.roundRect(matrixX, matrixY, matrixW, matrixH, 10)
    ctx.fill()
    ctx.stroke()

    const columns = 72
    const rows = 18
    const gap = 2
    const cellW = (matrixW - 24 - gap * (columns - 1)) / columns
    const cellH = (matrixH - 42 - gap * (rows - 1)) / rows
    for (let x = 0; x < columns; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        if (polarFrame) {
          const angleIndex = Math.round((x / Math.max(1, columns - 1)) * 359)
          const ledIndex = Math.round((y / Math.max(1, rows - 1)) * 79)
          const offset = angleIndex * 320 + ledIndex * 4
          const value = polarFrame[offset] / 255
          ctx.fillStyle = `rgb(${Math.round(polarFrame[offset + 1] * value)}, ${Math.round(polarFrame[offset + 2] * value)}, ${Math.round(polarFrame[offset + 3] * value)})`
        } else {
          const value = (Math.sin(x * 0.19 + y * 0.31 + time * 0.0015) + 1) / 2
          const hue = 176 + value * 90 + currentBrightness * 0.35
          ctx.fillStyle = `hsl(${hue % 360}, 86%, ${18 + value * 38}%)`
        }
        ctx.fillRect(matrixX + 12 + x * (cellW + gap), matrixY + 32 + y * (cellH + gap), cellW, cellH)
      }
    }
    ctx.fillStyle = '#b8d8e7'
    ctx.font = '600 11px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText('360 组角度数据 · 80 LED 径向采样', matrixX + 12, matrixY + 19)
    ctx.fillStyle = '#5c8195'
    ctx.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText('每组 320 B · 单圈 115,200 B', matrixX + matrixW - 150, matrixY + matrixH - 15)
  })

  return <canvas ref={canvasRef} className="device-canvas" />
}

function sceneIcon(scene: SceneItem) {
  return (
    <div className="scene-thumb" style={{ background: `linear-gradient(145deg, ${scene.accent}, ${scene.second})` }}>
      <span>{scene.emoji}</span>
      <div className="thumb-glow" />
    </div>
  )
}

function DisplayOptions({ showRight, showBottom, showCircleMask, onRight, onBottom, onCircle }: {
  showRight: boolean; showBottom: boolean; showCircleMask: boolean
  onRight: (value: boolean) => void; onBottom: (value: boolean) => void; onCircle: (value: boolean) => void
}) {
  return (
    <div className="display-options">
      <div><span>右侧参数栏</span><Switch aria-label="显示右侧参数栏" checked={showRight} onChange={onRight} /></div>
      <div><span>下方设备预览</span><Switch aria-label="显示下方设备预览" checked={showBottom} onChange={onBottom} /></div>
      <div><span>设备圆框</span><Switch aria-label="显示设备圆框" checked={showCircleMask} onChange={onCircle} /></div>
    </div>
  )
}

function App() {
  const { message } = AntdApp.useApp()
  const [selectedScene, setSelectedScene] = useState<SceneItem>(scenes[0])
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [brightness, setBrightness] = useState(82)
  const [cameraAngle, setCameraAngle] = useState(20)
  const [timeline, setTimeline] = useState(34)
  const [viewMode, setViewMode] = useState('编辑')
  const [quality, setQuality] = useState('标准')
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({
    state: 'disconnected',
    port: 5000,
    message: '尚未连接设备',
    timestamp: Date.now(),
  })
  const [deviceIp, setDeviceIp] = useState('192.168.1.100')
  const [showRight, setShowRight] = useState(true)
  const [showBottom, setShowBottom] = useState(false)
  const [showCircleMask, setShowCircleMask] = useState(true)
  const [bloomEnabled, setBloomEnabled] = useState(true)
  const [bloomStrength, setBloomStrength] = useState(0.35)
  const [polarProcessingMs, setPolarProcessingMs] = useState(0)
  const polarFrameRef = useRef<Uint8Array | null>(null)
  const recordedFramesRef = useRef<Uint8Array[]>([])
  const [recording, setRecording] = useState(false)
  const [recordedCount, setRecordedCount] = useState(0)
  const [importedModel, setImportedModel] = useState<ImportModelResult | null>(null)
  const [syncStatus, setSyncStatus] = useState<DeviceSyncStatus>({
    state: 'idle',
    transferredBytes: 0,
    totalBytes: 0,
    progress: 0,
    message: '等待上传 3D 帧',
    timestamp: Date.now(),
  })

  const connected = deviceStatus.state === 'connected'
  const deviceBadgeStatus = connected
    ? 'success'
    : deviceStatus.state === 'connecting'
      ? 'processing'
      : deviceStatus.state === 'error'
        ? 'error'
        : 'default'

  useEffect(() => {
    let disposed = false
    void deviceApi.getStatus().then((status) => {
      if (!disposed) setDeviceStatus(status)
    })
    const unsubscribe = deviceApi.onStatus((status) => {
      if (!disposed) setDeviceStatus(status)
    })
    const unsubscribeSync = deviceApi.onSyncStatus((status) => {
      if (!disposed) setSyncStatus(status)
    })
    return () => {
      disposed = true
      unsubscribe()
      unsubscribeSync()
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const timer = window.setTimeout(() => setRecording(false), 8000)
    return () => window.clearTimeout(timer)
  }, [recording])

  const handleSaveProject = async () => {
    const document: ProjectDocument = {
      version: 1,
      savedAt: new Date().toISOString(),
      selectedSceneId: selectedScene.id,
      playing,
      speed,
      brightness,
      cameraAngle,
      timeline,
      viewMode,
      quality,
      deviceIp,
      layout: { left: false, right: showRight, bottom: showBottom, circle: showCircleMask },
    }
    const result = await projectApi.save(document)
    result.ok ? message.success(result.message) : message.info(result.message)
  }

  const handleLoadProject = async () => {
    const result = await projectApi.load()
    if (!result.ok || !result.document) {
      message.info(result.message)
      return
    }
    const document = result.document
    setSelectedScene(scenes.find((scene) => scene.id === document.selectedSceneId) ?? scenes[0])
    setPlaying(document.playing)
    setSpeed(document.speed)
    setBrightness(document.brightness)
    setCameraAngle(document.cameraAngle)
    setTimeline(document.timeline)
    setViewMode(document.viewMode)
    setQuality(document.quality)
    setDeviceIp(document.deviceIp)
    setShowRight(document.layout.right)
    setShowBottom(document.layout.bottom)
    setShowCircleMask(document.layout.circle)
    message.success(result.message)
  }

  const handleImportModel = async () => {
    const result = await deviceApi.importModel()
    if (!result.ok || !result.files?.length || !result.mainFile) {
      message.info(result.message)
      return
    }
    setImportedModel(result)
    setSelectedScene(scenes.find((scene) => scene.id === 'custom') ?? scenes[0])
    message.success(result.message)
  }

  const handleRecordingToggle = () => {
    if (recording) {
      setRecording(false)
      return
    }
    recordedFramesRef.current = []
    setRecordedCount(0)
    setRecording(true)
  }

  const handleDeviceConnection = async () => {
    if (connected) {
      setDeviceStatus(await deviceApi.disconnect())
      return
    }

    setDeviceStatus({
      state: 'connecting',
      host: deviceIp,
      port: 5000,
      message: `正在连接 ${deviceIp}:5000`,
      timestamp: Date.now(),
    })
    const result = await deviceApi.connect({ host: deviceIp, port: 5000 })
    setDeviceStatus(result.status)
  }

  const handleExport = async () => {
    const frame = polarFrameRef.current
    if (!frame) {
      message.warning('尚未生成 360×80 极坐标帧')
      return
    }
    const frames = recordedFramesRef.current.length > 0 ? recordedFramesRef.current : [frame]
    const result = await deviceApi.exportFrames(frames, recordedFramesRef.current.length > 0 ? 4 : 1000 / 60)
    if (result.ok) message.success(result.message)
    else message.info(result.message)
  }

  const handleUpload = async () => {
    const frame = polarFrameRef.current
    if (!connected) return
    if (!frame) {
      setSyncStatus({
        state: 'error',
        transferredBytes: 0,
        totalBytes: 0,
        progress: 0,
        message: '尚未生成 360×80 极坐标帧',
        timestamp: Date.now(),
      })
      return
    }
    const frames = recordedFramesRef.current.length > 0 ? recordedFramesRef.current : [frame]
    setRecording(false)
    const result = await deviceApi.syncFrames(frames, recordedFramesRef.current.length > 0 ? 4 : 1000 / 60)
    if (!result.ok) {
      setSyncStatus((current) => ({ ...current, state: 'error', message: result.message, timestamp: Date.now() }))
    }
  }

  const syncBusy = syncStatus.state === 'preparing' || syncStatus.state === 'uploading' || syncStatus.state === 'committing'

  return (
    <Layout className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <ThunderboltOutlined />
          </div>
          <div className="brand-copy">
            <h1>FAN360 <span>裸眼3D风扇工作台</span></h1>
          </div>
        </div>
        <div className="topbar-center">
          <Select
            className="scene-select"
            value={selectedScene.id}
            onChange={(value) => {
              const scene = scenes.find((item) => item.id === value)
              if (scene) setSelectedScene(scene)
            }}
            options={scenes.map((scene) => ({ value: scene.id, label: `${scene.emoji}  ${scene.name}` }))}
            showSearch
            optionFilterProp="label"
            virtual={false}
            listHeight={420}
            aria-label="选择 3D 场景"
          />
        </div>
        <Space size={12} className="header-actions">
          <Button icon={<DownloadOutlined />} onClick={() => void handleExport()}>导出</Button>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            disabled={!connected}
            loading={syncBusy}
            onClick={() => void handleUpload()}
          >
            下载到设备
          </Button>
        </Space>
      </header>

      <Layout className="workspace">
        <Content className={`main-content ${showBottom ? 'has-bottom' : ''}`}>
          <div className="viewport-card">
            <div className="viewport-head">
              <div>
                <div className="eyebrow">LIVE 3D VIEWPORT</div>
                <Title level={4}>{selectedScene.name} · 编辑视角</Title>
              </div>
              <Space>
                <Tag color="purple">60 FPS UI</Tag>
                <Tag color="cyan">16.67 FPS DEVICE</Tag>
                <Select
                  size="small"
                  value={quality}
                  onChange={setQuality}
                  options={['草稿', '标准', '高质量'].map((value) => ({ value, label: value }))}
                />
                <Tooltip title="全屏预览">
                  <Button icon={<FullscreenOutlined />} />
                </Tooltip>
              </Space>
            </div>
            <div className="viewport-stage">
              <div className="square-stage">
                <div className="viewport-canvas">
                  <WebGLErrorBoundary>
                <EditorScene scene={selectedScene} playing={playing} speed={speed} cameraAngle={cameraAngle} brightness={brightness} bloomEnabled={bloomEnabled} bloomStrength={bloomStrength} modelAsset={importedModel} onPolarFrame={(frame) => { polarFrameRef.current = frame; if (recording) { const frames = recordedFramesRef.current; if (frames.length < 128) { frames.push(frame); setRecordedCount(frames.length) } } }} onPolarStats={setPolarProcessingMs} />
              </WebGLErrorBoundary>
                  <div className="viewport-overlay top-left">
                    <div className="hud-label">CAMERA</div>
                    <div className="hud-value">{cameraAngle}° / 38 mm</div>
                  </div>
                  <div className="viewport-overlay bottom-left">
                    <div className="hud-label">DISPLAY TARGET</div>
                    <div className="hud-value">360 × 80 · 4 B/LED</div>
                  </div>
                  <div className="viewport-overlay top-right">
                    <Tag color="success">GPU ACCELERATED</Tag>
                  </div>
                </div>
                {showCircleMask && (
                  <div className="circle-device-mask" aria-label="设备圆形显示区域">
                    <div className="circle-device-ring" />
                    <div className="circle-device-size">Ø 238.5 mm</div>
                  </div>
                )}
              </div>
            </div>
            <div className="playback-bar">
              <Space>
                <Button
                  type="primary"
                  shape="circle"
                  icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => setPlaying((value) => !value)}
                />
                <Button icon={<ReloadOutlined />} onClick={() => setTimeline(0)} />
                <Text type="secondary">00:00:02.04 / 00:00:06.00</Text>
              </Space>
              <div className="timeline-wrap">
                <Slider value={timeline} onChange={setTimeline} tooltip={{ formatter: (value) => `${value}%` }} />
              </div>
              <Space>
                <Text type="secondary">播放速率</Text>
                <Select
                  size="small"
                  value={speed}
                  onChange={setSpeed}
                  options={[
                    { value: 0.5, label: '0.5×' },
                    { value: 1, label: '1×' },
                    { value: 1.5, label: '1.5×' },
                    { value: 2, label: '2×' },
                  ]}
                />
              </Space>
            </div>
          </div>

          {showBottom && (
          <Row gutter={[14, 14]} className="preview-row">
            <Col span={14}>
              <Card className="device-card" title={<span><VideoCameraOutlined /> 设备显示仿真</span>} extra={<Tag color="cyan">POV Preview</Tag>}>
                <DevicePreview playing={playing} speed={speed} brightness={brightness} angle={cameraAngle} frameRef={polarFrameRef} />
              </Card>
            </Col>
            <Col span={10}>
              <Card className="data-card" title={<span><ThunderboltOutlined /> 数据与链路</span>} extra={<Tag color="green">1.92 MB/s</Tag>}>
                <Row gutter={[10, 10]}>
                  <Col span={12}><Statistic title="角度片" value={360} suffix="组" /></Col>
                  <Col span={12}><Statistic title="径向 LED" value={80} suffix="个" /></Col>
                  <Col span={12}><Statistic title="单圈耗时" value={60} suffix="ms" /></Col>
                  <Col span={12}><Statistic title="角度窗口" value={166.7} suffix="µs" precision={1} /></Col>
                  <Col span={12}><Statistic title="Worker 转换" value={polarProcessingMs} suffix="ms" precision={1} /></Col>
                </Row>
                <Divider />
                <div className="link-row"><span>单角度片</span><b>320 B</b></div>
                <div className="link-row"><span>单圈数据</span><b>115,200 B</b></div>
                <Progress percent={64} strokeColor={{ '0%': '#25d9ff', '100%': '#a45cff' }} />
                <Text type="secondary">模拟链路占用 64% · 建议预留 30% 余量</Text>
              </Card>
            </Col>
          </Row>
          )}
        </Content>

        <Sider width={318} collapsed={!showRight} collapsedWidth={48} trigger={null} className={`inspector-sider ${showRight ? '' : 'inspector-collapsed'}`}>
          {showRight ? <>
          <div className="inspector-head">
            <div>
              <div className="eyebrow">INSPECTOR</div>
              <Title level={4}>参数检查器</Title>
            </div>
            <Button type="text" icon={<SettingOutlined />} />
          </div>
          <Collapse
            className="inspector-collapse"
            defaultActiveKey={['scene', 'display', 'device']}
            items={[
              {
                key: 'scene',
                label: '场景与模型',
                children: (
                  <div className="scene-setting-panel">
                    <div className="link-row"><span>当前场景</span><b>{selectedScene.name}</b></div>
                    <div className="link-row"><span>场景分类</span><b>{selectedScene.category}</b></div>
                    <div className="link-row"><span>内置场景</span><b>{scenes.length} 个</b></div>
                    {importedModel?.mainFile && <div className="link-row"><span>导入模型</span><b>{importedModel.mainFile}</b></div>}
                    <Button block icon={<ExperimentOutlined />} onClick={() => void handleImportModel()} style={{ marginTop: 10 }}>
                      导入 GLB / glTF 模型
                    </Button>
                    <Space className="project-actions">
                      <Button icon={<SaveOutlined />} onClick={() => void handleSaveProject()}>保存项目</Button>
                      <Button icon={<FolderOpenOutlined />} onClick={() => void handleLoadProject()}>打开项目</Button>
                    </Space>
                  </div>
                ),
              },
              {
                key: 'camera',
                label: '镜头',
                children: (
                  <Form layout="vertical" className="inspector-form">
                    <Form.Item label="摄像机水平角度">
                      <Slider value={cameraAngle} onChange={setCameraAngle} min={-180} max={180} marks={{ '-180': '', 0: '', 180: '' }} />
                    </Form.Item>
                    <Form.Item label="焦距">
                      <Slider defaultValue={38} min={18} max={85} />
                    </Form.Item>
                    <Form.Item label="镜头距离">
                      <Slider defaultValue={4.6} min={2.5} max={8} step={0.1} />
                    </Form.Item>
                    <Form.Item label="摄像机模式">
                      <Select defaultValue="透视" options={['透视', '正交'].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item label="自动巡航">
                      <Switch defaultChecked />
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'animation',
                label: '动画',
                children: (
                  <Form layout="vertical" className="inspector-form">
                    <Form.Item label="动画录制">
                      <Space wrap>
                        <Button danger={recording} icon={<VideoCameraOutlined />} onClick={handleRecordingToggle}>{recording ? '停止录制' : '录制动画'}</Button>
                        {(recording || recordedCount > 0) && <Tag color={recording ? 'red' : 'green'}>{recordedCount} 帧</Tag>}
                      </Space>
                    </Form.Item>
                    <Form.Item label="播放速率">
                      <Slider value={speed} onChange={setSpeed} min={0.1} max={4} step={0.1} marks={{ 0.1: '0.1×', 1: '1×', 4: '4×' }} />
                    </Form.Item>
                    <Form.Item label="旋转方向">
                      <Select defaultValue="顺时针" options={['顺时针', '逆时针'].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item label="循环方式">
                      <Select defaultValue="循环" options={['循环', '往返', '单次'].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item label="运动模糊">
                      <Slider defaultValue={38} />
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'display',
                label: '显示',
                children: (
                  <Form layout="vertical" className="inspector-form">
                    <DisplayOptions showRight={showRight} showBottom={showBottom} showCircleMask={showCircleMask} onRight={setShowRight} onBottom={setShowBottom} onCircle={setShowCircleMask} />
                    <Divider />
                    <Form.Item label="输出亮度">
                      <Slider value={brightness} onChange={setBrightness} min={0} max={100} />
                    </Form.Item>
                    <Form.Item label="Bloom 辉光">
                      <Switch checked={bloomEnabled} onChange={setBloomEnabled} />
                    </Form.Item>
                    <Form.Item label="Bloom 强度">
                      <Slider value={bloomStrength} onChange={setBloomStrength} min={0} max={1} step={0.05} disabled={!bloomEnabled} />
                    </Form.Item>
                    <Form.Item label="径向边缘增强"><Switch defaultChecked /></Form.Item>
                    <Form.Item label="低亮度抖动"><Switch defaultChecked /></Form.Item>
                    <Form.Item label="Gamma 模式">
                      <Select defaultValue="sRGB → Device" options={['sRGB → Device', 'Linear', '自定义'].map((value) => ({ value, label: value }))} />
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'device',
                label: '设备',
                children: (
                  <div className="device-panel">
                    <div className="device-status">
                      <div className="device-orb">
                        <WifiOutlined />
                      </div>
                      <div>
                        <b>TCP 风扇设备</b>
                        <div className="muted">{deviceStatus.message ?? (connected ? `${deviceIp}:5000 · 已连接` : '等待手动连接')}</div>
                      </div>
                      <Badge status={deviceBadgeStatus} />
                    </div>
                    <Divider />
                    <Form layout="vertical" className="device-connect-form">
                      <Form.Item label="设备 IP">
                        <Input
                          value={deviceIp}
                          onChange={(event) => setDeviceIp(event.target.value)}
                          disabled={connected || deviceStatus.state === 'connecting'}
                          placeholder="例如 192.168.1.100"
                        />
                      </Form.Item>
                      <Form.Item label="TCP 端口">
                        <Input value="5000" disabled />
                      </Form.Item>
                      <Button
                        block
                        type={connected ? 'default' : 'primary'}
                        icon={connected ? undefined : <WifiOutlined />}
                        loading={deviceStatus.state === 'connecting'}
                        onClick={() => void handleDeviceConnection()}
                      >
                        {connected ? '断开连接' : deviceStatus.state === 'connecting' ? '连接中…' : '连接设备'}
                      </Button>
                    </Form>
                    <div className="sync-status-panel">
                      <div className="sync-status-head">
                        <span>{syncStatus.message}</span>
                        <b>{syncStatus.progress}%</b>
                      </div>
                      <Progress
                        percent={syncStatus.progress}
                        size="small"
                        status={syncStatus.state === 'error' ? 'exception' : syncStatus.state === 'success' ? 'success' : 'active'}
                        strokeColor={{ '0%': '#25d9ff', '100%': '#a45cff' }}
                      />
                      <div className="muted">{syncStatus.transferredBytes.toLocaleString()} / {syncStatus.totalBytes.toLocaleString()} B</div>
                    </div>
                    <Divider />
                    <div className="link-row"><span>转速</span><b>1000 RPM</b></div>
                    <div className="link-row"><span>角度解析度</span><b>1.0°</b></div>
                    <div className="link-row"><span>LED 间距</span><b>1.5 mm</b></div>
                    <div className="link-row"><span>同步模式</span><b>暂停刷新</b></div>
                  </div>
                ),
              },
            ]}
          />
          </> : (
            <Popover placement="leftTop" trigger="click" title="显示" content={
              <DisplayOptions showRight={showRight} showBottom={showBottom} showCircleMask={showCircleMask} onRight={setShowRight} onBottom={setShowBottom} onCircle={setShowCircleMask} />
            }>
              <Button aria-label="显示设置" title="显示设置" type="text" icon={<SettingOutlined />} />
            </Popover>
          )}
        </Sider>
      </Layout>
    </Layout>
  )
}

export default App
