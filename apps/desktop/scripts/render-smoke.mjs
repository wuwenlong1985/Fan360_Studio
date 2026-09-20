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

const previewLayout = `(() => {
  const main = document.querySelector('.main-content')
  const card = document.querySelector('.data-card')
  const footer = card.querySelector('.ant-card-body > .ant-typography')
  const canvas = document.querySelector('.device-canvas')
  const device = document.querySelector('.device-card')
  const radius = Math.min(canvas.clientHeight * 0.39, canvas.clientWidth * 0.19)
  const scale = canvas.width / canvas.clientWidth
  const pixels = canvas.getContext('2d').getImageData(
    Math.round((canvas.clientWidth * 0.3 - radius * 0.6) * scale),
    Math.round((canvas.clientHeight * 0.52 - radius * 0.6) * scale),
    Math.round(radius * 1.2 * scale), Math.round(radius * 1.2 * scale),
  ).data
  let colorful = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
    const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2])
    if (high > 50 && high - low > 40) colorful++
  }
  const rect = element => {
    const { x, y, width, height, bottom, right } = element.getBoundingClientRect()
    return { x, y, width, height, bottom, right }
  }
  return {
    main: rect(main), card: rect(card), footer: rect(footer), device: rect(device),
    canvas: rect(canvas), bitmap: { width: canvas.width, height: canvas.height },
    diskColorfulRatio: colorful / (pixels.length / 4),
    dpr: Math.min(devicePixelRatio, 2), scrollTop: main.scrollTop,
    clientHeight: main.clientHeight, scrollHeight: main.scrollHeight,
    clientWidth: main.clientWidth, scrollWidth: main.scrollWidth,
    viewportHeight: document.querySelector('.viewport-card').getBoundingClientRect().height,
    headerTop: document.querySelector('.app-header').getBoundingClientRect().top,
    inspectorTop: document.querySelector('.inspector-sider').getBoundingClientRect().top,
  }
})()`

function assertCanvasSize(layout) {
  assert.ok(Math.abs(layout.bitmap.width - layout.canvas.width * layout.dpr) <= 1, 'preview bitmap must follow card width')
  assert.ok(Math.abs(layout.bitmap.height - layout.canvas.height * layout.dpr) <= 1, 'preview bitmap must follow card height')
}

async function checkPreviewScrolling() {
  report.previewLayouts = []
  for (const [width, height, deviceScaleFactor] of [[2080, 1000, 1], [1600, 900, 1], [1366, 768, 1], [1180, 720, 1.5]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false })
    await evaluate(`document.querySelector('.main-content').scrollTop = 0`)
    await delay(500)
    const top = await evaluate(previewLayout)
    assert.ok(top.scrollHeight > top.clientHeight, `${width}: bottom preview needs a usable scrollbar`)
    assert.equal(top.scrollWidth, top.clientWidth, `${width}: no horizontal content clipping`)
    assert.ok(top.viewportHeight >= 480, `${width}: keep a usable 3D viewport`)
    assert.ok(top.canvas.height >= 280, `${width}: device disk and its captions need enough height`)
    assert.ok(top.diskColorfulRatio > 0.03, `${width}: device disk must show the sampled scene`)
    assert.ok(top.footer.bottom <= top.card.bottom - 8, `${width}: link summary must fit inside its card`)
    if (width < 1600) assert.ok(top.card.y >= top.device.bottom, `${width}: stack preview cards in narrow windows`)
    else assert.ok(Math.abs(top.card.y - top.device.y) < 1, `${width}: show preview cards side by side`)
    assertCanvasSize(top)

    // Drag the actual scrollbar thumb, rather than assigning scrollTop to reach the footer.
    const x = top.main.right - 6
    const thumbMiddle = top.main.y + top.clientHeight * top.clientHeight / top.scrollHeight / 2
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: thumbMiddle, button: 'left', buttons: 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: top.main.bottom - 2, button: 'left', buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: top.main.bottom - 2, button: 'left', buttons: 0, clickCount: 1 })
    await delay(300)
    const bottom = await evaluate(previewLayout)
    assert.ok(bottom.scrollTop > 0, `${width}: scrollbar drag must scroll the content`)
    assert.ok(bottom.footer.y >= bottom.main.y && bottom.footer.bottom <= bottom.main.bottom, `${width}: full link summary must be reachable`)
    assert.equal(bottom.headerTop, top.headerTop, 'header stays fixed while the main area scrolls')
    assert.equal(bottom.inspectorTop, top.inspectorTop, 'inspector scrolls independently')
    await screenshot(`preview-scroll-${width}`)

    await evaluate(`document.querySelector('button[aria-label="显示下方设备预览"]').click()`)
    await delay(300)
    const hidden = await evaluate(`({preview: Boolean(document.querySelector('.preview-row')), top: document.querySelector('.main-content').scrollTop, overflow: document.querySelector('.main-content').scrollHeight - document.querySelector('.main-content').clientHeight})`)
    assert.equal(hidden.preview, false)
    assert.equal(hidden.top, 0, 'hiding the preview restores the viewport to the top')
    assert.equal(hidden.overflow, 0, 'no empty scroll area after hiding the preview')
    await evaluate(`document.querySelector('button[aria-label="显示下方设备预览"]').click()`)
    await until(() => evaluate(`document.querySelector('canvas[data-has-polar-frame]')?.dataset.hasPolarFrame === 'true'`), 'restore device preview')
    report.previewLayouts.push({ width, height, deviceScaleFactor, top, bottom, hidden })
    console.log(`PASS preview ${width}x${height} @${deviceScaleFactor}: draggable scrollbar, complete content, show/hide`)
  }
  await send('Emulation.clearDeviceMetricsOverride')
  await delay(500)
}

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
  await checkPreviewScrolling()
  await evaluate(`document.querySelector('button[aria-label="显示设备圆框"]').click()`)
  await until(() => evaluate(`!document.querySelector('.circle-device-mask')`), 'hide circle')
  await evaluate(`document.querySelector('button[aria-label="显示右侧参数栏"]').click()`)
  await until(() => evaluate(`Boolean(document.querySelector('.inspector-collapsed'))`), 'hide inspector')
  await delay(300)
  assertCanvasSize(await evaluate(previewLayout))
  await evaluate(`document.querySelector('button[aria-label="显示设置"]').click()`)
  await until(() => evaluate(`Boolean(document.querySelector('button[aria-label="显示右侧参数栏"]'))`), 'display popover')
  await evaluate(`document.querySelector('button[aria-label="显示右侧参数栏"]').click()`)
  await until(() => evaluate(`!document.querySelector('.inspector-collapsed')`), 'restore inspector')
  await delay(300)
  assertCanvasSize(await evaluate(previewLayout))
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
