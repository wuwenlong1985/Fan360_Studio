// Exercise real Electron/WebGL output, including the offscreen device-frame worker.
// Run `npm run test:render`, or attach to a dev app with `--port=9333`.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const attachedPort = process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1]
const output = resolve(desktop, '../../test-artifacts', attachedPort ? 'render-dev' : 'render-built')
await mkdir(output, { recursive: true })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let child
let socket
let probeScript
let sequence = 0
const pending = new Map()
const errors = []
const probeToken = `render-${Date.now()}`
const report = { mode: attachedPort ? 'development' : 'built-file', scenes: [], errors }

async function until(callback, message, timeout = 15000) {
  const deadline = Date.now() + timeout
  do {
    const result = await callback()
    if (result) return result
    await delay(100)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${message}`)
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}

async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(output, `${name}.png`), Buffer.from(shot.data, 'base64'))
}

// Read the visible canvas, not a render target or an artificial fallback image.
const sample = `(() => {
  const canvas = document.querySelector('canvas[data-webgl-ready]')
  if (!canvas) return null
  const gl = canvas.getContext('webgl2')
  if (!gl || gl.isContextLost()) return null
  const pixels = new Uint8Array(canvas.width * canvas.height * 4)
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  let lit = 0, hash = 2166136261, colorful = 0
  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    if (Math.max(r, g, b) > 24) lit++
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colorful++
    hash = Math.imul(hash ^ (r + (g << 8) + (b << 16)), 16777619)
  }
  return { width: canvas.width, height: canvas.height, litRatio: lit / (pixels.length / 16), colorfulRatio: colorful / (pixels.length / 16), hash: hash >>> 0 }
})()`

try {
  let port = attachedPort
  if (!port) {
    const profile = await mkdtemp(join(tmpdir(), 'fan360-render-'))
    report.profile = profile
    child = spawn(require('electron'), [join(desktop, 'scripts/render-smoke-main.cjs'), '--remote-debugging-port=0', '--disable-backgrounding-occluded-windows', `--user-data-dir=${profile}`], {
      cwd: desktop, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RENDERER_URL: '' },
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    child.stdout.resume()
    port = await until(() => {
      if (child.exitCode !== null) throw new Error(`Electron exited: ${stderr}`)
      return stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1]
    }, 'Electron debugger startup')
  }
  const page = await until(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    return pages.find(page => page.type === 'page' && /localhost|index\.html/.test(page.url))
  }, 'application page')
  report.url = page.url
  socket = new WebSocket(page.webSocketDebuggerUrl)
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const callback = pending.get(message.id)
      if (!callback) return
      clearTimeout(callback.timer)
      pending.delete(message.id)
      message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
    } else if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
      errors.push(`Resource load failed: ${message.params.errorText}`)
    }
  })
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.bringToFront')
  await send('Network.enable')
  if (!attachedPort) {
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  }
  // Observe actual frames returned by the worker without replacing application behavior.
  const probe = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
    window.__fanRenderProbeToken = ${JSON.stringify(probeToken)};
    window.__fanRenderProbe = { frames: 0, litPixels: 0, bytes: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (!event.data?.frame) return;
          const frame = new Uint8Array(event.data.frame);
          let litPixels = 0;
          for (let i = 0; i < frame.length; i += 4) {
            if (frame[i] && (frame[i+1] || frame[i+2] || frame[i+3])) litPixels++;
          }
          window.__fanRenderProbe = { frames: window.__fanRenderProbe.frames + 1, litPixels, bytes: frame.length };
        });
      }
    };
    })();
  ` })
  probeScript = probe.identifier
  errors.length = 0
  await send('Page.reload', { ignoreCache: true })
  await send('Page.bringToFront')
  await until(() => evaluate(`Boolean(window.__fanRenderProbeToken === ${JSON.stringify(probeToken)} && document.querySelector('.scene-select .ant-select-selector') && document.querySelector('canvas[data-webgl-ready]'))`), 'WebGL initialization')

  const catalogSource = await readFile(join(desktop, 'src/renderer/src/scenes/sceneCatalog.ts'), 'utf8')
  const scenes = [...catalogSource.matchAll(/id: '([^']+)', name: '([^']+)'/g)].map(([, id, name]) => ({ id, name }))
  assert.equal(scenes.length, 20)
  for (const scene of scenes) {
    await evaluate(`document.querySelector('.scene-select .ant-select-selector').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
    await until(() => evaluate(`Boolean([...document.querySelectorAll('.ant-select-item-option')].find(e => e.textContent.trim().endsWith(${JSON.stringify(scene.name)})))`), `option ${scene.name}`)
    await evaluate(`[...document.querySelectorAll('.ant-select-item-option')].find(e => e.textContent.trim().endsWith(${JSON.stringify(scene.name)})).click()`)
    await until(() => evaluate(`document.querySelector('.viewport-head h4')?.textContent === ${JSON.stringify(`${scene.name} · 编辑视角`)}`), `scene ${scene.name}`)
    const previousFrames = await evaluate('window.__fanRenderProbe.frames')
    await until(() => evaluate(`window.__fanRenderProbe.frames >= ${previousFrames + 3}`), `device frames for ${scene.name}`)
    const first = await evaluate(sample)
    assert.ok(first?.litRatio > 0.03, `${scene.name}: visible canvas is black`)
    const hashes = new Set([first.hash])
    for (let i = 0; i < 4; i++) {
      await delay(scene.id === 'countdown' ? 350 : 100)
      hashes.add((await evaluate(sample)).hash)
    }
    assert.ok(hashes.size > 1, `${scene.name}: animation is frozen`)
    const worker = await evaluate('window.__fanRenderProbe')
    assert.equal(worker.bytes, 360 * 80 * 4)
    assert.ok(worker.litPixels > 0, `${scene.name}: empty device frame`)
    await screenshot(scene.id)
    report.scenes.push({ ...scene, ...first, animationSamples: hashes.size, worker })
    console.log(`PASS ${scene.id}: visible canvas, animation, ${worker.litPixels} lit device pixels`)
  }

  // Text/model scenes must release loading state and allow switching back to geometry.
  await evaluate(`document.querySelector('.scene-select .ant-select-selector').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await until(() => evaluate(`Boolean(document.querySelector('.ant-select-item-option'))`), 'scene options')
  await evaluate(`[...document.querySelectorAll('.ant-select-item-option')].find(e => e.textContent.includes('草莓')).click()`)
  await delay(500)
  await evaluate(`document.querySelector('.playback-bar button').click()`)
  await delay(500)
  const paused = await evaluate(sample)
  await delay(350)
  assert.equal((await evaluate(sample)).hash, paused.hash, 'paused strawberry must remain visible and stationary')
  assert.ok(paused.litRatio > 0.03)
  await evaluate(`document.querySelector('.playback-bar button').click()`)
  await delay(500)
  assert.notEqual((await evaluate(sample)).hash, paused.hash, 'resuming playback must animate')
  report.pauseResume = true
  await evaluate(`document.querySelector('button[aria-label="显示下方设备预览"]').click()`)
  await until(() => evaluate(`document.querySelector('canvas[data-has-polar-frame]')?.dataset.hasPolarFrame === 'true'`), 'device preview frame')
  report.devicePreview = true
  await screenshot('device-preview')
  await evaluate(`document.querySelector('button[aria-label="显示设备圆框"]').click()`)
  await until(() => evaluate(`!document.querySelector('.circle-device-mask')`), 'hide circle')
  await evaluate(`document.querySelector('button[aria-label="显示右侧参数栏"]').click()`)
  await until(() => evaluate(`Boolean(document.querySelector('.inspector-collapsed'))`), 'hide inspector')
  await evaluate(`document.querySelector('button[aria-label="显示设置"]').click()`)
  await until(() => evaluate(`Boolean(document.querySelector('button[aria-label="显示右侧参数栏"]'))`), 'display popover')
  await evaluate(`document.querySelector('button[aria-label="显示右侧参数栏"]').click()`)
  await until(() => evaluate(`!document.querySelector('.inspector-collapsed')`), 'restore inspector')
  report.displayToggles = true
  const header = await evaluate(`({height:document.querySelector('.app-header').getBoundingClientRect().height, buttons:[...document.querySelectorAll('.app-header button')].map(b=>b.textContent.replace(/\\s/g,'')), selectors:document.querySelectorAll('.app-header .ant-select').length})`)
  assert.equal(header.height, 72)
  assert.deepEqual(header.buttons, ['导出', '下载到设备'])
  assert.equal(header.selectors, 1)
  report.header = header
  assert.deepEqual(errors, [], 'renderer errors')
  console.log(`PASS ${scenes.length} scenes, pause/resume, device preview, no renderer errors`)
} catch (error) {
  report.failure = error.stack ?? String(error)
  console.error(report.failure)
  if (socket?.readyState === WebSocket.OPEN) await screenshot('failure').catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  if (probeScript && socket?.readyState === WebSocket.OPEN) {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: probeScript }).catch(() => {})
  }
  if (child && socket?.readyState === WebSocket.OPEN) {
    await send('Browser.close').catch(() => {})
  }
  socket?.close()
  for (const callback of pending.values()) clearTimeout(callback.timer)
  child?.kill()
}
