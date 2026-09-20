import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import {
  Box3, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute,
  ExtrudeGeometry, Group, InstancedMesh, Object3D, Shape, SRGBColorSpace, Vector3,
} from 'three'

type Motion = { playing: boolean; speed: number }

function Turntable({ playing, speed, children, spin = 0.22 }: Motion & { children: ReactNode; spin?: number }) {
  const root = useRef<Group>(null)
  useFrame((_, delta) => { if (root.current && playing) root.current.rotation.y += delta * speed * spin })
  return <group ref={root}>{children}</group>
}

function fruitSurface(t: number, angle: number) {
  const radius = 0.98 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1.13 - 0.48 * t)
  const irregularity = 1 + 0.018 * Math.sin(angle * 3 + t * 9) + 0.01 * Math.sin(angle * 5 - t * 6)
  return new Vector3(radius * Math.cos(angle) * irregularity, 1.05 - t * 2.35, radius * Math.sin(angle) * irregularity)
}

function surfaceNormal(t: number, angle: number) {
  const along = fruitSurface(t + 0.0001, angle).sub(fruitSurface(t - 0.0001, angle))
  const around = fruitSurface(t, angle + 0.0001).sub(fruitSurface(t, angle - 0.0001))
  return around.cross(along).normalize()
}

function makeLeaf(length: number, width: number, bend: number) {
  const vertices: number[] = [], indices: number[] = []
  for (let row = 0; row <= 20; row++) {
    const t = row / 20
    for (let col = 0; col <= 8; col++) {
      const side = col / 4 - 1
      const edge = Math.sin(Math.PI * t) * width * (1 + 0.07 * Math.sin(t * Math.PI * 16))
      vertices.push(side * edge, bend * t * t + 0.06 * (1 - side * side) * Math.sin(Math.PI * t), t * length)
      if (row < 20 && col < 8) {
        const a = row * 9 + col
        indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function RealisticStrawberry(props: Motion) {
  const instances = useRef<InstancedMesh>(null)
  const seeds = useMemo(() => {
    const result: { position: Vector3; normal: Vector3 }[] = []
    for (let row = 0; row < 15; row++) {
      const t = 0.15 + row * 0.052
      const count = Math.max(6, Math.round(Math.hypot(fruitSurface(t, 0).x, fruitSurface(t, 0).z) * 32))
      for (let i = 0; i < count; i++) {
        const angle = (i + (row % 2) * 0.5) * Math.PI * 2 / count + Math.sin(row * 3) * 0.06
        result.push({ position: fruitSurface(t, angle), normal: surfaceNormal(t, angle) })
      }
    }
    return result
  }, [])
  const skin = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = []
    const color = new Color()
    for (let row = 0; row <= 112; row++) {
      const t = row / 112
      for (let col = 0; col <= 144; col++) {
        const angle = col / 144 * Math.PI * 2
        const point = fruitSurface(t, angle)
        const normal = surfaceNormal(Math.max(0.0001, Math.min(0.9999, t)), angle)
        let depression = 0
        for (const seed of seeds) {
          const distance = point.distanceToSquared(seed.position)
          if (distance < 0.009) depression += 0.018 * Math.exp(-distance / 0.0011)
        }
        point.addScaledVector(normal, -depression)
        vertices.push(point.x, point.y, point.z)
        uvs.push(col / 144, t)
        const variation = 0.018 * Math.sin(angle * 11 + t * 90) + 0.01 * Math.sin(angle * 27 - t * 33)
        color.setHSL(0.002 + 0.008 * Math.sin(t * 6), 0.84, 0.24 + variation + 0.035 * (1 - t))
        colors.push(color.r, color.g, color.b)
        if (row < 112 && col < 144) {
          const a = row * 145 + col
          indices.push(a, a + 1, a + 145, a + 1, a + 146, a + 145)
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [seeds])
  const bump = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')!
    const image = context.createImageData(512, 512)
    let random = 104729
    for (let i = 0; i < image.data.length; i += 4) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const value = 110 + random % 45
      image.data.set([value, value, value, 255], i)
    }
    context.putImageData(image, 0, 0)
    return new CanvasTexture(canvas)
  }, [])
  const leaf = useMemo(() => makeLeaf(0.9, 0.18, -0.26), [])
  useEffect(() => () => { skin.dispose(); bump.dispose(); leaf.dispose() }, [skin, bump, leaf])
  useLayoutEffect(() => {
    const object = new Object3D()
    seeds.forEach(({ position, normal }, index) => {
      object.position.copy(position).addScaledVector(normal, -0.008)
      object.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal)
      object.scale.set(0.017, 0.032, 0.011)
      object.updateMatrix()
      instances.current!.setMatrixAt(index, object.matrix)
    })
    instances.current!.instanceMatrix.needsUpdate = true
  }, [seeds])
  return (
    <Turntable {...props} spin={0.2}>
      <group rotation={[0, 0, -0.12]} position={[0, -0.06, 0]}>
        <mesh geometry={skin} castShadow receiveShadow>
          <meshPhysicalMaterial vertexColors roughness={0.48} clearcoat={0.12} clearcoatRoughness={0.4} bumpMap={bump} bumpScale={0.018} />
        </mesh>
        <instancedMesh ref={instances} args={[undefined, undefined, seeds.length]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#b7a153" roughness={0.58} />
        </instancedMesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} geometry={leaf} position={[0, 1.03, 0]} rotation={[0.15, i * Math.PI * 2 / 7, 0]} scale={0.82 + i % 3 * 0.1} castShadow>
            <meshPhysicalMaterial color={i % 2 ? '#35551d' : '#47672c'} roughness={0.72} side={DoubleSide} sheen={0.25} />
          </mesh>
        ))}
        <mesh position={[0.025, 1.15, 0]} rotation={[0.16, 0, -0.2]} castShadow>
          <cylinderGeometry args={[0.022, 0.046, 0.3, 14]} />
          <meshStandardMaterial color="#49662c" roughness={0.84} />
        </mesh>
      </group>
    </Turntable>
  )
}

function ScannedObject({ url, ...motion }: Motion & { url: string }) {
  const { scene } = useGLTF(url)
  const object = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse(child => { child.castShadow = true; child.receiveShadow = true })
    const box = new Box3().setFromObject(clone)
    const size = box.getSize(new Vector3())
    const factor = 2.65 / Math.max(size.x, size.y, size.z)
    const center = box.getCenter(new Vector3())
    clone.position.sub(center)
    const wrapper = new Group()
    wrapper.scale.setScalar(factor)
    wrapper.add(clone)
    return wrapper
  }, [scene])
  return <Turntable {...motion}><primitive object={object} dispose={null} /></Turntable>
}

export function RealisticPortrait(props: Motion) {
  return <ScannedObject {...props} url="./models/portrait/portrait.gltf" />
}

export function RealisticAstronaut(props: Motion) {
  return <ScannedObject {...props} url="./models/astronaut.glb" />
}

export function RealisticEarth(props: Motion) {
  const map = useTexture('./textures/earth-day.jpg')
  useLayoutEffect(() => { map.colorSpace = SRGBColorSpace; map.anisotropy = 8; map.needsUpdate = true }, [map])
  return (
    <Turntable {...props} spin={0.12}>
      <group rotation={[0, 0, 0.409]}>
        <mesh castShadow><sphereGeometry args={[1.3, 96, 64]} /><meshPhysicalMaterial map={map} roughness={0.75} clearcoat={0.08} /></mesh>
        <mesh scale={1.007}><sphereGeometry args={[1.3, 64, 48]} /><meshPhysicalMaterial color="#7fbbef" transparent opacity={0.035} roughness={0.4} depthWrite={false} /></mesh>
      </group>
    </Turntable>
  )
}

export function RealisticRose(props: Motion) {
  const petal = useMemo(() => {
    const positions: number[] = [], indices: number[] = []
    for (let row = 0; row <= 24; row++) {
      const t = row / 24
      for (let col = 0; col <= 24; col++) {
        const u = col / 12 - 1
        const width = 0.54 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (0.45 + 0.55 * t)
        positions.push(u * width, t * 0.84, 0.26 * u * u * Math.sin(Math.PI * t) + 0.4 * t ** 3 + Math.sin(u * 8) * 0.008 * t)
        if (row < 24 && col < 24) {
          const a = row * 25 + col
          indices.push(a, a + 1, a + 25, a + 1, a + 26, a + 25)
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  const leaf = useMemo(() => makeLeaf(0.85, 0.24, 0.12), [])
  useEffect(() => () => { petal.dispose(); leaf.dispose() }, [petal, leaf])
  return (
    <Turntable {...props}>
      <group position={[0, 0.08, 0]} rotation={[0.2, 0, -0.1]}>
        <mesh position={[0, -0.58, 0]} castShadow><cylinderGeometry args={[0.035, 0.05, 1.9, 18]} /><meshStandardMaterial color="#294526" roughness={0.86} /></mesh>
        {[0, 1].map(i => <mesh key={i} geometry={leaf} position={[0, -0.4 - i * 0.45, 0]} rotation={[-0.6, 1.4 + i * Math.PI, 0]} castShadow><meshPhysicalMaterial color="#315329" roughness={0.65} side={DoubleSide} /></mesh>)}
        <group position={[0, 0.12, 0]}>
          {Array.from({ length: 30 }, (_, i) => {
            const layer = Math.floor(i / 6)
            const angle = i * 2.39996
            const radius = 0.02 + layer * 0.055
            return <group key={i} rotation={[0, angle, 0]}>
              <mesh geometry={petal} position={[0, 0.25 - layer * 0.055, radius]} rotation={[0.05 + layer * 0.14, 0, 0]} scale={0.46 + layer * 0.14} castShadow receiveShadow>
                <meshPhysicalMaterial color={layer < 2 ? '#620b1b' : '#980e2b'} roughness={0.76} side={DoubleSide} sheen={0.3} sheenColor="#d2516c" sheenRoughness={0.85} />
              </mesh>
            </group>
          })}
        </group>
      </group>
    </Turntable>
  )
}

export function RealisticGift(props: Motion) {
  return (
    <Turntable {...props}>
      <RoundedBox args={[1.7, 1.5, 1.7]} radius={0.035} smoothness={3} castShadow receiveShadow><meshPhysicalMaterial color="#7e1324" roughness={0.6} sheen={0.3} /></RoundedBox>
      <RoundedBox args={[1.79, 0.22, 1.79]} position={[0, 0.71, 0]} radius={0.025} castShadow><meshPhysicalMaterial color="#981b2d" roughness={0.52} /></RoundedBox>
      {[0, 1].map(i => <mesh key={i} rotation={[0, i * Math.PI / 2, 0]}><boxGeometry args={[0.2, 1.76, 1.8]} /><meshPhysicalMaterial color="#bc9650" metalness={0.65} roughness={0.32} sheen={0.7} /></mesh>)}
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.28, 1.0, 0]} rotation={[0.25, 0, side * 0.6]} scale={[1, 0.52, 1]} castShadow><torusGeometry args={[0.3, 0.055, 16, 64]} /><meshPhysicalMaterial color="#d1b475" metalness={0.55} roughness={0.28} /></mesh>)}
    </Turntable>
  )
}

export function RealisticDiamond(props: Motion) {
  const geometry = useMemo(() => {
    const points: number[] = [], indices: number[] = []
    const rings = [[0.5, 0.72], [1, 0.16], [1, 0.08], [0.02, -1.1]]
    rings.forEach(([radius, y]) => { for (let i = 0; i < 16; i++) points.push(Math.sin(i * Math.PI / 8) * radius, y, Math.cos(i * Math.PI / 8) * radius) })
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 16; i++) {
      const a = ring * 16 + i, b = ring * 16 + (i + 1) % 16
      indices.push(a, b, a + 16, b, b + 16, a + 16)
    }
    for (let i = 1; i < 15; i++) indices.push(0, i, i + 1)
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(points, 3))
    result.setIndex(indices)
    const facets = result.toNonIndexed()
    result.dispose()
    facets.computeVertexNormals()
    return facets
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <Turntable {...props} spin={0.28}><mesh geometry={geometry} rotation={[0.2, 0, 0.15]}><meshPhysicalMaterial color="#edfaff" transmission={1} thickness={1.5} ior={2.42} roughness={0.015} metalness={0} envMapIntensity={1.8} attenuationColor="#c2e5ff" attenuationDistance={5} flatShading /></mesh></Turntable>
}

export function RealisticCar(props: Motion) {
  const [body, cabin] = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(-1.63, -0.23)
    shape.lineTo(1.65, -0.23)
    shape.quadraticCurveTo(1.85, -0.03, 1.66, 0.19)
    shape.quadraticCurveTo(1.1, 0.36, 0.5, 0.32)
    shape.lineTo(-0.8, 0.36)
    shape.quadraticCurveTo(-1.8, 0.37, -1.63, -0.23)
    const shell = new ExtrudeGeometry(shape, { depth: 1.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 })
    shell.translate(0, 0, -0.64)
    const roof = new Shape()
    roof.moveTo(-1.05, 0.33)
    roof.quadraticCurveTo(-0.67, 0.84, -0.38, 0.85)
    roof.lineTo(0.2, 0.83)
    roof.quadraticCurveTo(0.5, 0.71, 0.86, 0.32)
    roof.closePath()
    const glass = new ExtrudeGeometry(roof, { depth: 1.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 20 })
    glass.translate(0, 0, -0.53)
    return [shell, glass]
  }, [])
  useEffect(() => () => { body.dispose(); cabin.dispose() }, [body, cabin])
  return (
    <Turntable {...props} spin={0.18}>
      <group position={[0, -0.35, 0]} rotation={[0, -0.5, 0]} scale={0.85}>
        <mesh geometry={body} castShadow receiveShadow><meshPhysicalMaterial color="#930f1e" metalness={0.62} roughness={0.25} clearcoat={1} clearcoatRoughness={0.13} /></mesh>
        <mesh geometry={cabin} castShadow><meshPhysicalMaterial color="#101c27" metalness={0.3} roughness={0.1} clearcoat={1} /></mesh>
        <RoundedBox args={[0.64, 0.065, 1.08]} radius={0.03} position={[-0.12, 0.84, 0]} castShadow><meshPhysicalMaterial color="#a7192a" metalness={0.6} roughness={0.24} clearcoat={1} /></RoundedBox>
        {[-1, 1].map(side => <group key={side}>
          <RoundedBox args={[0.04, 0.44, 0.045]} radius={0.01} position={[-0.23, 0.57, side * 0.566]}><meshStandardMaterial color="#191b1e" roughness={0.4} metalness={0.65} /></RoundedBox>
          <RoundedBox args={[0.2, 0.06, 0.035]} radius={0.015} position={[-0.6, 0.16, side * 0.725]}><meshStandardMaterial color="#b5b7bb" metalness={0.92} roughness={0.2} /></RoundedBox>
          <RoundedBox args={[0.19, 0.1, 0.18]} radius={0.04} position={[0.55, 0.4, side * 0.8]} castShadow><meshPhysicalMaterial color="#930f1e" metalness={0.65} roughness={0.2} clearcoat={1} /></RoundedBox>
          <RoundedBox args={[0.14, 0.07, 0.36]} radius={0.025} position={[1.66, 0.16, side * 0.44]} rotation={[0, side * 0.13, 0]}><meshPhysicalMaterial color="#e4edff" roughness={0.12} emissive="#c7dfff" emissiveIntensity={0.7} /></RoundedBox>
          <RoundedBox args={[0.1, 0.08, 0.35]} radius={0.018} position={[-1.64, 0.12, side * 0.44]}><meshPhysicalMaterial color="#c30c14" roughness={0.2} emissive="#b80d12" emissiveIntensity={0.5} /></RoundedBox>
          {[-1.12, 1.12].map(x => <group key={x} position={[x, -0.18, side * 0.72]}>
            <mesh castShadow><torusGeometry args={[0.265, 0.095, 20, 64]} /><meshStandardMaterial color="#161619" roughness={0.92} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.255, 0.255, 0.12, 48]} /><meshStandardMaterial color="#33363a" roughness={0.5} metalness={0.8} /></mesh>
            <mesh position={[0, 0, side * 0.075]}><torusGeometry args={[0.233, 0.016, 12, 64]} /><meshStandardMaterial color="#bbc2c8" metalness={0.95} roughness={0.25} /></mesh>
            {Array.from({ length: 5 }, (_, i) => <group key={i} rotation={[0, 0, i * Math.PI * 2 / 5]}><mesh position={[0, 0.125, side * 0.082]}><boxGeometry args={[0.037, 0.22, 0.025]} /><meshStandardMaterial color="#a7afb9" metalness={0.96} roughness={0.26} /></mesh></group>)}
            <mesh position={[0, 0, side * 0.095]}><sphereGeometry args={[0.047, 16, 12]} /><meshStandardMaterial color="#b9bec4" metalness={1} roughness={0.25} /></mesh>
          </group>)}
        </group>)}
        <RoundedBox args={[0.04, 0.17, 0.7]} radius={0.025} position={[1.77, -0.07, 0]}><meshStandardMaterial color="#111317" roughness={0.76} /></RoundedBox>
        {[-0.05, 0, 0.05].map(y => <mesh key={y} position={[1.796, -0.07 + y, 0]}><boxGeometry args={[0.012, 0.009, 0.6]} /><meshStandardMaterial color="#5d6067" metalness={0.7} roughness={0.45} /></mesh>)}
      </group>
    </Turntable>
  )
}
