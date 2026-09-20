// Keep the test's animation frames running when another desktop window covers it.
// This only changes the test process, not the application's background behavior.
const { app } = require('electron')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
app.on('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false)
})
void import(pathToFileURL(join(__dirname, '../out/main/index.js')).href)
