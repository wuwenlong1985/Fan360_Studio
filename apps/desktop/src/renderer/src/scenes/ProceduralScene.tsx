import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { SceneId } from './sceneCatalog'
import { Gltf, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  Mesh,
  Points,
  Texture,
  Vector3,
  type BufferGeometry,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ImportModelResult } from '../../../shared/device'
const FONT_URL = new URL('../assets/helvetiker_regular.typeface.json', import.meta.url).href

type SceneProps = {
  accent: string
  second: string
  playing: boolean
  speed: number
  modelAsset?: ImportModelResult | null
}

function useFallbackModel(): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void import('@pmndrs/assets/models/bunny.glb.js').then((module) => {
      if (active) setUrl(module.default)
    })
    return () => {
      active = false
    }
  }, [])
  return url
}

function AnimatedGroup({ playing, speed, children, spin = 0.65 }: SceneProps & { children: ReactNode; spin?: number }) {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    if (ref.current && playing) ref.current.rotation.y += delta * speed * spin
  })
  return <group ref={ref}>{children}</group>
}

function Strawberry({ accent, second, playing, speed }: SceneProps) {
  const group = useRef<Group>(null)
  const seeds = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => {
        const t = (index + 0.5) / 34
        const phi = Math.acos(1 - 2 * t)
        const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5)
        return [Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 1.2, Math.sin(phi) * Math.sin(theta)] as [number, number, number]
      }),
    [],
  )
  useFrame((_, delta) => {
    if (group.current && playing) group.current.rotation.y += delta * speed * 0.62
  })
  return (
    <group ref={group} position={[0, -0.05, 0]}>
      <mesh castShadow scale={[1, 1.2, 1]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial color={accent} roughness={0.28} clearcoat={0.55} clearcoatRoughness={0.18} emissive={accent} emissiveIntensity={0.08} />
      </mesh>
      {seeds.map((position, index) => (
        <mesh key={index} position={position} scale={0.052}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#ffd166" emissive="#ff9d2e" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[(index - 2) * 0.27, 1.23 - Math.abs(index - 2) * 0.06, 0]} rotation={[0, 0, (index - 2) * 0.24]}>
          <coneGeometry args={[0.16, 0.72, 7]} />
          <meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function Santa({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.4}>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[1.05, 48, 48]} />
        <meshStandardMaterial color={accent} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.72, 40, 40]} />
        <meshStandardMaterial color="#f1c8a8" roughness={0.62} />
      </mesh>
      <mesh position={[0, 1.19, 0]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.62, 1.35, 36]} />
        <meshStandardMaterial color="#d61836" roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.16, 20, 20]} />
        <meshStandardMaterial color="#fff7e8" emissive="#ffffff" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.5, 0.65]}>
        <sphereGeometry args={[0.48, 32, 32]} />
        <meshStandardMaterial color="#f4f6f8" roughness={0.8} />
      </mesh>
      <mesh position={[-0.36, 0.8, 0.56]}><sphereGeometry args={[0.055, 12, 12]} /><meshBasicMaterial color="#111820" /></mesh>
      <mesh position={[0.36, 0.8, 0.56]}><sphereGeometry args={[0.055, 12, 12]} /><meshBasicMaterial color="#111820" /></mesh>
      <mesh position={[0, 0.55, 0.61]}><sphereGeometry args={[0.12, 18, 18]} /><meshStandardMaterial color="#d96b76" /></mesh>
    </AnimatedGroup>
  )
}

function Portrait({ accent, second, playing, speed }: SceneProps) {
  const hair = useMemo(() => Array.from({ length: 18 }, (_, index) => ({ angle: (index / 18) * Math.PI * 2, y: 0.44 + Math.sin(index * 1.8) * 0.2 })), [])
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.34}>
      <mesh position={[0, 0.18, 0]} scale={[0.82, 1.12, 0.8]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshPhysicalMaterial color={accent} roughness={0.46} clearcoat={0.18} />
      </mesh>
      <mesh position={[0, 0.12, 0.73]} scale={[0.47, 0.72, 0.18]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#f0b79f" roughness={0.52} />
      </mesh>
      {hair.map((item, index) => (
        <mesh key={index} position={[Math.cos(item.angle) * 0.78, item.y, Math.sin(item.angle) * 0.75]} scale={[0.2, 0.46, 0.2]}>
          <sphereGeometry args={[1, 18, 18]} />
          <meshStandardMaterial color={second} roughness={0.32} metalness={0.18} />
        </mesh>
      ))}
      <mesh position={[-0.19, 0.28, 0.85]}><sphereGeometry args={[0.048, 12, 12]} /><meshBasicMaterial color="#15202a" /></mesh>
      <mesh position={[0.19, 0.28, 0.85]}><sphereGeometry args={[0.048, 12, 12]} /><meshBasicMaterial color="#15202a" /></mesh>
      <mesh position={[0, -0.02, 0.89]}><sphereGeometry args={[0.08, 16, 16]} /><meshStandardMaterial color="#d96e76" /></mesh>
    </AnimatedGroup>
  )
}

function Countdown({ accent, second, playing }: SceneProps) {
  const [value, setValue] = useState(3)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setValue((current) => (current <= 1 ? 3 : current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [playing])
  return (
    <group>
      <Text font={FONT_URL} fontSize={2.15} anchorX="center" anchorY="middle" letterSpacing={-0.08}>
        {String(value)}
        <meshStandardMaterial color={accent} emissive={second} emissiveIntensity={0.72} metalness={0.52} roughness={0.2} />
      </Text>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.55, 0.035, 12, 120]} /><meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.9} /></mesh>
    </group>
  )
}

function Earth({ accent, second, playing, speed }: SceneProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 1024, 512)
      gradient.addColorStop(0, '#063f8f')
      gradient.addColorStop(0.5, '#0c7fc4')
      gradient.addColorStop(1, '#041f55')
      context.fillStyle = gradient
      context.fillRect(0, 0, 1024, 512)
      context.fillStyle = second
      const lands = [[120, 180, 150, 70], [320, 120, 120, 55], [460, 235, 90, 110], [710, 170, 180, 80], [850, 310, 90, 45]]
      lands.forEach(([x, y, rx, ry], index) => {
        context.beginPath()
        for (let step = 0; step <= 40; step += 1) {
          const angle = (step / 40) * Math.PI * 2
          const wobble = 1 + Math.sin(step * 2.1 + index) * 0.18
          const px = x + Math.cos(angle) * rx * wobble
          const py = y + Math.sin(angle) * ry * wobble
          if (step === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        }
        context.fill()
      })
    }
    return new CanvasTexture(canvas)
  }, [second])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.33}>
      <mesh><sphereGeometry args={[1.35, 72, 72]} /><meshStandardMaterial map={texture} roughness={0.7} emissive={accent} emissiveIntensity={0.06} /></mesh>
      <mesh scale={1.055}><sphereGeometry args={[1.35, 48, 48]} /><meshBasicMaterial color="#4edcff" transparent opacity={0.11} blending={AdditiveBlending} side={DoubleSide} /></mesh>
      <mesh rotation={[1.2, 0.3, 0]}><torusGeometry args={[1.72, 0.012, 8, 140]} /><meshBasicMaterial color="#6be8ff" transparent opacity={0.42} /></mesh>
    </AnimatedGroup>
  )
}

function Gift({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.42}>
      <mesh position={[0, -0.1, 0]}><boxGeometry args={[1.8, 1.5, 1.8]} /><meshStandardMaterial color={accent} roughness={0.42} metalness={0.08} /></mesh>
      <mesh position={[0, -0.1, 0]}><boxGeometry args={[0.34, 1.54, 1.84]} /><meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.18} /></mesh>
      <mesh position={[0, -0.1, 0]}><boxGeometry args={[1.84, 1.54, 0.34]} /><meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.18} /></mesh>
      <mesh position={[-0.32, 0.9, 0]} rotation={[0, 0, -0.55]}><torusGeometry args={[0.35, 0.13, 14, 40]} /><meshStandardMaterial color={second} /></mesh>
      <mesh position={[0.32, 0.9, 0]} rotation={[0, 0, 0.55]}><torusGeometry args={[0.35, 0.13, 14, 40]} /><meshStandardMaterial color={second} /></mesh>
    </AnimatedGroup>
  )
}

function Rose({ accent, second, playing, speed }: SceneProps) {
  const petals = useMemo(() => Array.from({ length: 22 }, (_, index) => ({ angle: index * 2.4, radius: 0.35 + (index % 5) * 0.075, y: -0.07 * (index % 4) })), [])
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.3}>
      <mesh position={[0, -0.65, 0]}><cylinderGeometry args={[0.055, 0.075, 2.1, 12]} /><meshStandardMaterial color={second} /></mesh>
      <mesh rotation={[0.35, 0, 0.4]} position={[0.25, -0.35, 0]}><sphereGeometry args={[0.35, 24, 16]} /><meshStandardMaterial color="#3ecb79" /></mesh>
      <group position={[0, 0.65, 0]}>
        {petals.map((petal, index) => (
          <mesh key={index} position={[Math.cos(petal.angle) * petal.radius, petal.y + index * 0.012, Math.sin(petal.angle) * petal.radius]} rotation={[0.65, petal.angle, 0]} scale={[0.45, 0.17, 0.28]}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshPhysicalMaterial color={index % 2 ? accent : '#ff6b94'} roughness={0.34} clearcoat={0.28} side={DoubleSide} />
          </mesh>
        ))}
      </group>
    </AnimatedGroup>
  )
}

function Fireworks({ accent, second, playing, speed }: SceneProps) {
  const points = useRef<Points>(null)
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (let burst = 0; burst < 4; burst += 1) {
      const offset = burst * 0.42
      for (let index = 0; index < 220; index += 1) {
        const phi = Math.acos(1 - 2 * (index + 0.5) / 220)
        const theta = Math.PI * (1 + Math.sqrt(5)) * index
        const radius = 0.45 + burst * 0.2
        positions.push(offset + Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius)
      }
    }
    const result = new Float32Array(positions)
    return new Float32BufferAttribute(result, 3)
  }, [])
  useFrame((_, delta) => {
    if (points.current && playing) points.current.rotation.y += delta * speed * 0.25
  })
  return (
    <group>
      <points ref={points}><bufferGeometry><primitive attach="attributes-position" object={geometry} /></bufferGeometry><pointsMaterial color={accent} size={0.035} sizeAttenuation transparent opacity={0.92} blending={AdditiveBlending} /></points>
      <points rotation={[0.4, 0, 0.2]}><bufferGeometry><primitive attach="attributes-position" object={geometry} /></bufferGeometry><pointsMaterial color={second} size={0.025} sizeAttenuation transparent opacity={0.62} blending={AdditiveBlending} /></points>
    </group>
  )
}

function Butterfly({ accent, second, playing, speed }: SceneProps) {
  const left = useRef<Mesh>(null)
  const right = useRef<Mesh>(null)
  useFrame((state) => {
    const flap = playing ? Math.sin(state.clock.elapsedTime * speed * 5) * 0.55 : 0.2
    if (left.current) left.current.rotation.y = flap
    if (right.current) right.current.rotation.y = -flap
  })
  return (
    <group scale={1.2}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.07, 1.15, 12, 16]} /><meshStandardMaterial color="#202b36" /></mesh>
      <mesh ref={left} position={[-0.55, 0, 0]}>
        <sphereGeometry args={[0.56, 28, 20]} />
        <meshPhysicalMaterial color={accent} emissive={accent} emissiveIntensity={0.28} transparent opacity={0.82} side={DoubleSide} />
      </mesh>
      <mesh ref={right} position={[0.55, 0, 0]}>
        <sphereGeometry args={[0.56, 28, 20]} />
        <meshPhysicalMaterial color={second} emissive={second} emissiveIntensity={0.28} transparent opacity={0.82} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function Astronaut({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.35}>
      <mesh position={[0, 0.05, 0]}><capsuleGeometry args={[0.48, 1.05, 18, 32]} /><meshStandardMaterial color="#eef5f8" roughness={0.48} /></mesh>
      <mesh position={[0, 0.92, 0]}><sphereGeometry args={[0.58, 40, 40]} /><meshPhysicalMaterial color="#74dcff" transparent opacity={0.44} transmission={0.28} roughness={0.15} /></mesh>
      <mesh position={[-0.66, 0.22, 0]} rotation={[0, 0, -0.3]}><capsuleGeometry args={[0.17, 0.75, 12, 20]} /><meshStandardMaterial color="#dce7ed" /></mesh>
      <mesh position={[0.66, 0.22, 0]} rotation={[0, 0, 0.3]}><capsuleGeometry args={[0.17, 0.75, 12, 20]} /><meshStandardMaterial color="#dce7ed" /></mesh>
      <mesh position={[0, -0.88, 0]}><sphereGeometry args={[0.54, 32, 32]} /><meshStandardMaterial color={accent} emissive={second} emissiveIntensity={0.18} /></mesh>
    </AnimatedGroup>
  )
}

function EnergyOrb({ accent, second, playing, speed }: SceneProps) {
  const core = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (core.current && playing) core.current.rotation.y += delta * speed * 0.9
  })
  return (
    <group>
      <mesh ref={core}><icosahedronGeometry args={[1.18, 2]} /><meshPhysicalMaterial color={accent} emissive={second} emissiveIntensity={0.78} roughness={0.16} metalness={0.52} wireframe /></mesh>
      <mesh scale={0.82}><sphereGeometry args={[1.18, 48, 48]} /><meshBasicMaterial color={second} transparent opacity={0.09} blending={AdditiveBlending} /></mesh>
      <mesh rotation={[1.1, 0.5, 0]}><torusGeometry args={[1.55, 0.022, 8, 140]} /><meshBasicMaterial color={accent} transparent opacity={0.7} /></mesh>
      <mesh rotation={[0.3, 1.1, 0.7]}><torusGeometry args={[1.42, 0.018, 8, 140]} /><meshBasicMaterial color={second} transparent opacity={0.55} /></mesh>
    </group>
  )
}

function Flame({ accent, second, playing, speed }: SceneProps) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (!ref.current || !playing) return
    ref.current.rotation.y += 0.01 * speed
    ref.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * speed * 6) * 0.06
  })
  return (
    <group ref={ref}>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[(index - 2) * 0.16, 0.2 + (2 - Math.abs(index - 2)) * 0.22, 0]} scale={[0.5 + index * 0.08, 1 + index * 0.2, 0.5]}>
          <coneGeometry args={[0.55, 1.45, 32]} />
          <meshPhysicalMaterial color={index < 2 ? second : accent} emissive={index < 2 ? second : accent} emissiveIntensity={0.85} transparent opacity={0.72} />
        </mesh>
      ))}
      <pointLight position={[0, 0.2, 0]} color={accent} intensity={8} distance={5} />
    </group>
  )
}

function Diamond({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.52}>
      <mesh scale={[1, 1.35, 1]}><octahedronGeometry args={[1, 0]} /><meshPhysicalMaterial color={accent} emissive={second} emissiveIntensity={0.18} metalness={0.72} roughness={0.08} transmission={0.2} clearcoat={1} /></mesh>
      <mesh rotation={[0, 0.6, 0]}><octahedronGeometry args={[1.18, 0]} /><meshBasicMaterial color={second} wireframe transparent opacity={0.28} /></mesh>
    </AnimatedGroup>
  )
}

function Clock({ accent, second, playing, speed }: SceneProps) {
  const minute = useRef<Mesh>(null)
  const hour = useRef<Mesh>(null)
  useFrame((state) => {
    const time = state.clock.elapsedTime * speed
    if (minute.current) minute.current.rotation.z = -time * 0.5
    if (hour.current) hour.current.rotation.z = -time * 0.08
  })
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.28, 0.09, 20, 100]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.48} metalness={0.6} /></mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2
        return <mesh key={index} position={[Math.cos(angle) * 1.02, Math.sin(angle) * 1.02, 0]} rotation={[0, 0, angle]}><boxGeometry args={[0.32, 0.035, 0.06]} /><meshBasicMaterial color={second} /></mesh>
      })}
      <mesh ref={minute} position={[0, 0.4, 0]}><boxGeometry args={[0.05, 0.82, 0.05]} /><meshBasicMaterial color="#eaffff" /></mesh>
      <mesh ref={hour} position={[0, 0.27, 0]}><boxGeometry args={[0.07, 0.56, 0.06]} /><meshBasicMaterial color={second} /></mesh>
      <mesh><sphereGeometry args={[0.09, 20, 20]} /><meshBasicMaterial color={accent} /></mesh>
    </group>
  )
}

function Spectrum({ accent, second, playing, speed }: SceneProps) {
  const bars = useRef<Mesh[]>([])
  useFrame((state) => {
    bars.current.forEach((bar, index) => {
      if (!bar) return
      const value = playing ? 0.35 + (Math.sin(state.clock.elapsedTime * speed * 4 + index * 0.55) + 1) * 0.48 : 0.45
      bar.scale.y = value
      bar.position.y = value * 0.62
    })
  })
  return (
    <group>
      {Array.from({ length: 32 }, (_, index) => {
        const angle = (index / 32) * Math.PI * 2
        return (
          <mesh key={index} ref={(node) => { if (node) bars.current[index] = node }} position={[Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.09, 1.25, 0.16]} />
            <meshStandardMaterial color={index % 3 === 0 ? accent : second} emissive={index % 3 === 0 ? accent : second} emissiveIntensity={0.66} />
          </mesh>
        )
      })}
    </group>
  )
}

function Logo({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.44}>
      <mesh rotation={[0.35, 0.2, 0]}><torusKnotGeometry args={[0.84, 0.22, 180, 28, 2, 3]} /><meshPhysicalMaterial color={accent} emissive={second} emissiveIntensity={0.38} metalness={0.72} roughness={0.18} clearcoat={0.7} /></mesh>
      <mesh><sphereGeometry args={[0.18, 24, 24]} /><meshBasicMaterial color={second} /></mesh>
    </AnimatedGroup>
  )
}

function Text3D({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.28}>
      <Text font={FONT_URL} fontSize={1.35} anchorX="center" anchorY="middle" letterSpacing={-0.06}>
        FAN360
        <meshStandardMaterial color={accent} emissive={second} emissiveIntensity={0.72} metalness={0.48} roughness={0.22} />
      </Text>
      <mesh position={[0, -1.05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.16, 0.025, 8, 100]} /><meshBasicMaterial color={second} /></mesh>
    </AnimatedGroup>
  )
}

function Car({ accent, second, playing, speed }: SceneProps) {
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.3}>
      <mesh position={[0, 0.15, 0]} scale={[1.8, 0.42, 0.78]}><boxGeometry args={[1, 1, 1]} /><meshPhysicalMaterial color={accent} metalness={0.68} roughness={0.22} clearcoat={0.8} /></mesh>
      <mesh position={[-0.15, 0.58, 0]} scale={[1.05, 0.48, 0.72]}><boxGeometry args={[1, 1, 1]} /><meshPhysicalMaterial color="#9feaff" transparent opacity={0.58} metalness={0.18} roughness={0.12} /></mesh>
      {[[-1.02, -0.25, 0.72], [1.02, -0.25, 0.72], [-1.02, -0.25, -0.72], [1.02, -0.25, -0.72]].map((position, index) => (
        <mesh key={index} position={position as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.31, 0.31, 0.2, 28]} /><meshStandardMaterial color="#11171d" /></mesh>
      ))}
      <mesh position={[1.73, 0.16, 0]} scale={[0.08, 0.28, 0.55]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={second} /></mesh>
    </AnimatedGroup>
  )
}

function ParticleHead({ accent, second, playing, speed }: SceneProps) {
  const points = useRef<Points>(null)
  const geometry = useMemo(() => {
    const values: number[] = []
    for (let index = 0; index < 1800; index += 1) {
      const phi = Math.acos(1 - 2 * (index + 0.5) / 1800)
      const theta = Math.PI * (1 + Math.sqrt(5)) * index
      const scale = 0.88 + Math.sin(index * 0.31) * 0.06
      values.push(Math.sin(phi) * Math.cos(theta) * scale, Math.cos(phi) * scale * 1.24, Math.sin(phi) * Math.sin(theta) * scale * 0.82)
    }
    return new Float32BufferAttribute(new Float32Array(values), 3)
  }, [])
  useFrame((_, delta) => {
    if (points.current && playing) points.current.rotation.y += delta * speed * 0.25
  })
  return (
    <points ref={points}>
      <bufferGeometry><primitive attach="attributes-position" object={geometry} /></bufferGeometry>
      <pointsMaterial color={accent} size={0.025} transparent opacity={0.9} blending={AdditiveBlending} />
      <pointLight color={second} intensity={5} distance={5} />
    </points>
  )
}

function ImportedModel({ asset, speed, accent, second }: { asset: ImportModelResult; speed: number; accent: string; second: string }) {
  const [root, setRoot] = useState<Group | null>(null)
  const rootRef = useRef<Group | null>(null)
  const mixerRef = useRef<AnimationMixer | null>(null)

  useEffect(() => {
    if (!asset.files?.length || !asset.mainFile) return
    let active = true
    const urls: string[] = []
    const resolved = new Map<string, string>()
    for (const file of asset.files) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(file.data).buffer], { type: file.mime }))
      urls.push(url)
      resolved.set(file.name, url)
      resolved.set(file.relativePath, url)
      resolved.set('./' + file.relativePath, url)
    }
    const manager = new LoadingManager()
    manager.setURLModifier((url) => {
      if (/^(data:|blob:|https?:)/i.test(url)) return url
      const normalized = decodeURIComponent(url.split('?')[0]).replaceAll('\\', '/').replace(/^\.\//, '')
      return resolved.get(normalized) ?? resolved.get(normalized.split('/').pop() ?? '') ?? url
    })
    const loader = new GLTFLoader(manager)
    const main = asset.files.find((file) => file.name === asset.mainFile)
    if (!main) return
    const onLoad = (gltf: { scene: Group; animations: import('three').AnimationClip[] }) => {
      if (!active) return
      const scene = gltf.scene
      const box = new Box3().setFromObject(scene)
      const size = box.getSize(new Vector3())
      const center = box.getCenter(new Vector3())
      const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
      scene.position.sub(center)
      const wrapper = new Group()
      wrapper.scale.setScalar(2.15 / maxDimension)
      wrapper.add(scene)
      if (gltf.animations.length > 0) {
        const mixer = new AnimationMixer(scene)
        mixer.clipAction(gltf.animations[0]).play()
        mixerRef.current = mixer
      }
      rootRef.current = wrapper
      setRoot(wrapper)
    }
    const onError = (error: unknown) => console.error('[model-import]', error)
    const data = new Uint8Array(main.data)
    if (main.name.toLowerCase().endsWith('.glb')) loader.parse(data.buffer as ArrayBuffer, '', onLoad, onError)
    else loader.parse(new TextDecoder().decode(data), '', onLoad, onError)
    return () => {
      active = false
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
      rootRef.current?.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            Object.values(material).forEach((value) => { if (value instanceof Texture) value.dispose() })
            material.dispose()
          })
        }
      })
      rootRef.current = null
      urls.forEach(URL.revokeObjectURL)
    }
  }, [asset])

  useFrame((_, delta) => mixerRef.current?.update(delta * speed))
  if (!root) return <mesh><icosahedronGeometry args={[0.85, 1]} /><meshStandardMaterial color={accent} wireframe emissive={second} emissiveIntensity={0.55} /></mesh>
  return <primitive object={root} />
}

function Custom({ accent, second, playing, speed, modelAsset }: SceneProps) {
  const fallbackModel = useFallbackModel()
  const source = fallbackModel
  return (
    <AnimatedGroup accent={accent} second={second} playing={playing} speed={speed} spin={0.22}>
      {modelAsset ? (
        <ImportedModel asset={modelAsset} speed={speed} accent={accent} second={second} />
      ) : source ? (
        <Suspense fallback={<mesh><icosahedronGeometry args={[0.85, 1]} /><meshStandardMaterial color={accent} wireframe emissive={second} emissiveIntensity={0.55} /></mesh>}>
          <Gltf src={source} scale={1.35} position={[0, -0.55, 0]} />
        </Suspense>
      ) : (
        <mesh><icosahedronGeometry args={[0.85, 1]} /><meshStandardMaterial color={accent} wireframe emissive={second} emissiveIntensity={0.55} /></mesh>
      )}
      <mesh position={[0, -1.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.45, 0.025, 10, 120]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <Text font={FONT_URL} fontSize={0.38} anchorX="center" anchorY="middle" position={[0, -1.15, 0.8]}>
        {modelAsset ? "LOCAL MODEL" : "CC0 GLB"}
        <meshStandardMaterial color={second} emissive={second} emissiveIntensity={0.82} />
      </Text>
    </AnimatedGroup>
  )
}

const SCENE_COMPONENTS: Record<SceneId, ComponentType<SceneProps>> = {
  strawberry: Strawberry,
  santa: Santa,
  portrait: Portrait,
  countdown: Countdown,
  earth: Earth,
  gift: Gift,
  rose: Rose,
  fireworks: Fireworks,
  butterfly: Butterfly,
  astronaut: Astronaut,
  energy: EnergyOrb,
  flame: Flame,
  diamond: Diamond,
  clock: Clock,
  spectrum: Spectrum,
  logo: Logo,
  text3d: Text3D,
  car: Car,
  particles: ParticleHead,
  custom: Custom,
}

export function ProceduralScene(props: SceneProps & { sceneId: SceneId }) {
  const SceneComponent = SCENE_COMPONENTS[props.sceneId]
  return <SceneComponent {...props} />
}
