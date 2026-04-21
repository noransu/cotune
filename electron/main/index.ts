import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerPtyHandlers } from './ipc/pty.ipc'
import { registerProjectHandlers } from './ipc/project.ipc'
import { registerSessionHandlers } from './ipc/session.ipc'
import { registerProxyHandlers } from './ipc/proxy.ipc'
import { registerProcessHandlers, processManager } from './ipc/process.ipc'
import { BrowserTabManager, registerBrowserHandlers } from './services/browser-tab-manager'
import { PtyManager } from './services/pty-manager'
import { safeSend } from './utils/safe-send'

let mainWindow: BrowserWindow | null = null
let tabManager: BrowserTabManager | null = null
const ptyManager = new PtyManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    backgroundColor: '#1e1e2e',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  tabManager = new BrowserTabManager(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowHandlers(): void {
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  mainWindow?.on('maximize', () => {
    safeSend(mainWindow, 'window:maximized-changed', true)
  })
  mainWindow?.on('unmaximize', () => {
    safeSend(mainWindow, 'window:maximized-changed', false)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cotune.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  registerWindowHandlers()

  // Register all IPC handlers
  registerPtyHandlers(ptyManager, mainWindow!)
  registerProjectHandlers()
  registerSessionHandlers()
  registerProxyHandlers(mainWindow!)
  registerProcessHandlers(mainWindow!)
  registerBrowserHandlers(mainWindow!, tabManager!)
})

app.on('window-all-closed', () => {
  ptyManager.destroyAll()
  processManager.stopAll()
  tabManager?.destroyAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  ptyManager.destroyAll()
  processManager.stopAll()
  tabManager?.destroyAll()
})
