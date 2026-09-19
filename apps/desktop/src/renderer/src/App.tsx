import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Float, OrbitControls, Sparkles } from '@react-three/drei'
import { LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, WebGLRenderTarget, type Group } from 'three'
import { deviceApi } from './services/deviceClient'
import type { DeviceStatus, DeviceSyncStatus } from '../../shared/device'
import {
  CloudUploadOutlined,
  DownloadOutlined,
  ExperimentOutlined,
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
  Segmented,
  Select,
  Slider,
  Space,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography

type SceneItem = {
  id: string
  name: string
  category: string
  emoji: string
  accent: string
  second: string
}

const scenes: SceneItem[] = [
  { id: 'strawberry', name: '草莓', category: '商品', emoji: '🍓', accent: '#ff496c', second: '#6dff9d' },
  { id: 'santa', name: '圣诞老人', category: '节庆', emoji: '🎅', accent: '#ff465f', second: '#f7f0e8' },
  { id: 'portrait', name: '人物肖像', category: '人物', emoji: '👩', accent: '#ff9f7a', second: '#8f7dff' },
  { id: 'countdown', name: '数字倒计时', category: '数字', emoji: '3', accent: '#28e7ff', second: '#885cff' },
  { id: 'earth', name: '旋转地球', category: '科技', emoji: '🌍', accent: '#21b3ff', second: '#53f9bd' },
  { id: 'gift', name: '圣诞礼盒', category: '节庆', emoji: '🎁', accent: '#ff4f6d', second: '#ffd166' },
  { id: 'rose', name: '玫瑰花', category: '商品', emoji: '🌹', accent: '#ff3864', second: '#ff83ae' },
  { id: 'fireworks', name: '烟花', category: '节庆', emoji: '✦', accent: '#ffd166', second: '#ff5ccf' },
  { id: 'butterfly', name: '蝴蝶', category: '自然', emoji: '🦋', accent: '#24d9ff', second: '#ac70ff' },
  { id: 'astronaut', name: '卡通宇航员', category: '角色', emoji: '👨‍🚀', accent: '#f4f7ff', second: '#2ad4ff' },
  { id: 'energy', name: '炫彩能量球', category: '抽象', emoji: '◉', accent: '#00e0ff', second: '#8c55ff' },
  { id: 'flame', name: '火焰图腾', category: '抽象', emoji: '🔥', accent: '#ff8a00', second: '#ff2d55' },
  { id: 'diamond', name: '旋转钻石', category: '商品', emoji: '💎', accent: '#63e9ff', second: '#ffffff' },
  { id: 'clock', name: '全息时钟', category: '数字', emoji: '◷', accent: '#35e5ff', second: '#4e75ff' },
  { id: 'spectrum', name: '音乐频谱', category: '音频', emoji: '▥', accent: '#4dff9d', second: '#287cff' },
  { id: 'logo', name: '品牌 LOGO', category: '品牌', emoji: '◈', accent: '#ffc857', second: '#ff5f6d' },
  { id: 'text3d', name: '3D 文字', category: '品牌', emoji: 'T', accent: '#34ddff', second: '#a45cff' },
  { id: 'car', name: '跑车', category: '商品', emoji: '🏎', accent: '#ff4757', second: '#d7e3ff' },
  { id: 'particles', name: '粒子头像', category: '人物', emoji: '✺', accent: '#5ce1e6', second: '#9c6cff' },
  { id: 'custom', name: '自定义模型', category: '我的', emoji: '+', accent: '#68758b', second: '#b6c5d8' },
]

const accentFor = (scene: SceneItem) => [scene.accent, scene.second]

function Strawberry({ accent, second }: { accent: string; second: string }) {
  const group = useRef<Group>(null)
  const seeds = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => {
        const t = (index + 0.5) / 28
        const phi = Math.acos(1 - 2 * t)
        const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5)
        const radius = 1.01
        return [
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi) * 1.2,
          radius * Math.sin(phi) * Math.sin(theta),
        ] as [number, number, number]
      }),
    [],
  )

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.62
  })

  return (
    <group ref={group} position={[0, -0.05, 0]}>
      <mesh castShadow receiveShadow scale={[1, 1.2, 1]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial
          color={accent}
          roughness={0.28}
          metalness={0.05}
          clearcoat={0.55}
          clearcoatRoughness={0.18}
          emissive={accent}
          emissiveIntensity={0.08}
        />
      </mesh>
      {seeds.map((position, index) => (
        <mesh key={index} position={position} scale={0.055}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#ffd166" emissive="#ff9d2e" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh
          key={index}
          castShadow
          position={[(index - 2) * 0.27, 1.22 - Math.abs(index - 2) * 0.06, 0]}
          rotation={[0, 0, (index - 2) * 0.24]}
        >
          <coneGeometry args={[0.16, 0.72, 7]} />
          <meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.2} />
        </mesh>
      ))}
      <pointLight position={[-2.3, 2.2, 2.8]} color="#54d9ff" intensity={5} distance={8} />
      <pointLight position={[2.8, -1.2, 1.8]} color="#a45cff" intensity={3} distance={7} />
      <Sparkles count={70} scale={[4.2, 3.2, 4.2]} size={1.5} speed={0.28} color="#6fe9ff" />
    </group>
  )
}

function PolarCapture({
  playing,
  brightness,
  onFrame,
}: {
  playing: boolean
  brightness: number
  onFrame: (frame: Uint8Array) => void
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
  const worker = useMemo(() => new Worker(new URL('./workers/polar.worker.ts', import.meta.url), { type: 'module' }), [])
  const workerBusy = useRef(false)
  const requestId = useRef(0)
  const lastCapture = useRef(0)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    worker.onmessage = (event: MessageEvent<{ id: number; frame?: ArrayBuffer; error?: string }>) => {
      workerBusy.current = false
      if (event.data.frame) onFrameRef.current(new Uint8Array(event.data.frame))
      if (event.data.error) console.error('[polar-worker]', event.data.error)
    }
    return () => {
      worker.terminate()
      target.dispose()
    }
  }, [target, worker])

  useFrame((state) => {
    const interval = playing ? 0.25 : 1
    if (workerBusy.current || state.clock.elapsedTime - lastCapture.current < interval) return
    lastCapture.current = state.clock.elapsedTime
    const previousTarget = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    gl.setRenderTarget(previousTarget)
    const transferable = pixels.slice().buffer
    workerBusy.current = true
    worker.postMessage(
      {
        id: ++requestId.current,
        pixels: transferable,
        width: size,
        height: size,
        options: { radius: size * 0.46, brightness: brightness / 100, gamma: 1, sampling: 'bilinear' },
      },
      [transferable],
    )
  }, 1)

  return null
}

function EditorScene({ scene, playing, speed, cameraAngle, brightness, onPolarFrame }: { scene: SceneItem; playing: boolean; speed: number; cameraAngle: number; brightness: number; onPolarFrame: (frame: Uint8Array) => void }) {
  const [accent, second] = accentFor(scene)

  return (
    <Canvas shadows="basic" dpr={[1, 2]} camera={{ position: [0.4, 0.2, 4.6], fov: 38 }}>
      <color attach="background" args={['#05090f']} />
      <fog attach="fog" args={['#05090f', 5.5, 10]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[4, 6, 4]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 0, -2]} color="#207cff" intensity={4} />
      <Float speed={playing ? 1.2 * speed : 0} rotationIntensity={0.16} floatIntensity={0.28}>
        <group rotation={[0.08, (cameraAngle * Math.PI) / 180, 0]}>
          <Strawberry accent={accent} second={second} />
        </group>
      </Float>
      <PolarCapture playing={playing} brightness={brightness} onFrame={onPolarFrame} />
      <ContactShadows position={[0, -1.55, 0]} opacity={0.45} scale={5} blur={2.7} far={4} color="#000000" />
      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.25, 80]} />
        <meshStandardMaterial color="#0b1824" roughness={0.92} metalness={0.18} />
      </mesh>
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.7}
        maxDistance={6.2}
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

function App() {
  const { message } = AntdApp.useApp()
  const [selectedScene, setSelectedScene] = useState(scenes[0])
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
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [showBottom, setShowBottom] = useState(false)
  const [showCircleMask, setShowCircleMask] = useState(true)
  const polarFrameRef = useRef<Uint8Array | null>(null)
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
    const result = await deviceApi.exportFrame(frame)
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
    const result = await deviceApi.syncFrame(frame)
    if (!result.ok) {
      setSyncStatus((current) => ({ ...current, state: 'error', message: result.message, timestamp: Date.now() }))
    }
  }

  const syncBusy = syncStatus.state === 'preparing' || syncStatus.state === 'uploading' || syncStatus.state === 'committing'
  const selectedIndex = scenes.findIndex((scene) => scene.id === selectedScene.id)

  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <ThunderboltOutlined />
          </div>
          <div>
            <div className="brand-name">FAN360 STUDIO</div>
            <div className="brand-subtitle">裸眼 3D 旋转风扇工作台</div>
          </div>
        </div>
        <div className="topbar-center">
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(String(value))}
            options={['编辑', '真实设备', '数据']}
          />
          <Tag color="cyan">{selectedScene.name}</Tag>
          <Tag variant="filled">3D 原型</Tag>
          <div className="panel-toggles">
            <Button size="small" type={showLeft ? 'primary' : 'default'} onClick={() => setShowLeft((value) => !value)}>左栏</Button>
            <Button size="small" type={showRight ? 'primary' : 'default'} onClick={() => setShowRight((value) => !value)}>右栏</Button>
            <Button size="small" type={showBottom ? 'primary' : 'default'} onClick={() => setShowBottom((value) => !value)}>下方</Button>
            <Button size="small" type={showCircleMask ? 'primary' : 'default'} onClick={() => setShowCircleMask((value) => !value)}>圆框</Button>
          </div>
        </div>
        <Space size={10}>
          <Badge status={deviceBadgeStatus} text={<span className="status-text">{connected ? "TCP 设备已连接" : deviceStatus.state === "connecting" ? "TCP 连接中" : "TCP 设备待连接"}</span>} />
          <Tooltip title="保存项目">
            <Button icon={<SaveOutlined />} />
          </Tooltip>
          <Button icon={<DownloadOutlined />} onClick={() => void handleExport()}>导出</Button>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            disabled={!connected}
            loading={syncBusy}
            onClick={() => void handleUpload()}
          >
            上传并运行
          </Button>
        </Space>
      </Header>

      <Layout className="workspace">
        {showLeft && (
        <Sider width={258} className="scene-sider">
          <div className="sider-heading">
            <div>
              <div className="eyebrow">CONTENT LIBRARY</div>
              <Title level={4}>3D 场景库</Title>
            </div>
            <Button type="text" icon={<ReloadOutlined />} />
          </div>
          <div className="library-meta">
            <Text type="secondary">{scenes.length} 个内置场景</Text>
            <Tag color="blue">20 / 20</Tag>
          </div>
          <div className="scene-list">
            {scenes.map((scene, index) => (
              <button
                className={`scene-item ${scene.id === selectedScene.id ? 'is-selected' : ''}`}
                key={scene.id}
                onClick={() => setSelectedScene(scene)}
              >
                {sceneIcon(scene)}
                <span className="scene-info">
                  <span className="scene-name">{scene.name}</span>
                  <span className="scene-category">{scene.category}</span>
                </span>
                {index === selectedIndex && <span className="selected-dot" />}
              </button>
            ))}
          </div>
          <Divider />
          <Button block icon={<ExperimentOutlined />}>
            导入 GLB / 视频 / LOGO
          </Button>
        </Sider>
        )}

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
                  <EditorScene scene={selectedScene} playing={playing} speed={speed} cameraAngle={cameraAngle} brightness={brightness} onPolarFrame={(frame) => { polarFrameRef.current = frame }} />
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

        {showRight && (
        <Sider width={318} className="inspector-sider">
          <div className="inspector-head">
            <div>
              <div className="eyebrow">INSPECTOR</div>
              <Title level={4}>参数检查器</Title>
            </div>
            <Button type="text" icon={<SettingOutlined />} />
          </div>
          <Tabs
            defaultActiveKey="camera"
            items={[
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
                    <Form.Item label="输出亮度">
                      <Slider value={brightness} onChange={setBrightness} min={0} max={100} />
                    </Form.Item>
                    <Form.Item label="Bloom 辉光"><Switch defaultChecked /></Form.Item>
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
                      <Badge status={connected ? 'success' : 'default'} />
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
        </Sider>
        )}
      </Layout>
    </Layout>
  )
}

export default App






