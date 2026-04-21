import { BrowserWindow, BrowserView, session, ipcMain } from 'electron'
import { safeSend } from '../utils/safe-send'

interface BrowserTab {
  id: string
  view: BrowserView
  title: string
  url: string
}

export class BrowserTabManager {
  private tabs = new Map<string, BrowserTab>()
  private activeTabId: string | null = null
  private mainWindow: BrowserWindow
  private proxyPort: number = 9000
  private headerHeight = 40 // title bar height
  private addressBarHeight = 36
  private sidePanelWidth = 0 // width of the right side panel (routes/logs)

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setProxyPort(port: number): void {
    this.proxyPort = port
  }

  async createTab(id: string, url?: string): Promise<string> {
    // Create a custom session for the browser tab
    const partition = `persist:browser-${id}`
    const ses = session.fromPartition(partition)

    // Allow self-signed certificates in dev
    ses.setCertificateVerifyProc((_request, callback) => {
      callback(0) // 0 = success
    })

    const view = new BrowserView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const tab: BrowserTab = {
      id,
      view,
      title: 'New Tab',
      url: url || 'about:blank'
    }

    this.tabs.set(id, tab)

    // Listen for title changes
    view.webContents.on('page-title-updated', (_event, title) => {
      tab.title = title
      safeSend(this.mainWindow, 'browser:title-updated', { id, title })
    })

    // Listen for URL changes
    view.webContents.on('did-navigate', (_event, url) => {
      tab.url = url
      safeSend(this.mainWindow, 'browser:url-updated', { id, url })
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      tab.url = url
      safeSend(this.mainWindow, 'browser:url-updated', { id, url })
    })

    // Load URL
    if (url && url !== 'about:blank') {
      view.webContents.loadURL(url)
    }

    return id
  }

  showTab(id: string): void {
    // Remove current view
    if (this.activeTabId && this.activeTabId !== id) {
      const current = this.tabs.get(this.activeTabId)
      if (current) {
        this.mainWindow.removeBrowserView(current.view)
      }
    }

    const tab = this.tabs.get(id)
    if (!tab) return

    this.mainWindow.addBrowserView(tab.view)
    this.activeTabId = id
    this.updateBounds()
  }

  hideAllTabs(): void {
    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId)
      if (tab) {
        this.mainWindow.removeBrowserView(tab.view)
      }
      this.activeTabId = null
    }
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    if (this.activeTabId === id) {
      this.mainWindow.removeBrowserView(tab.view)
      this.activeTabId = null
    }

    tab.view.webContents.close()
    this.tabs.delete(id)
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
      url = 'http://' + url
    }

    tab.view.webContents.loadURL(url)
    tab.url = url
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id)
    if (tab?.view.webContents.canGoBack()) {
      tab.view.webContents.goBack()
    }
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id)
    if (tab?.view.webContents.canGoForward()) {
      tab.view.webContents.goForward()
    }
  }

  reload(id: string): void {
    const tab = this.tabs.get(id)
    if (tab) {
      tab.view.webContents.reload()
    }
  }

  openDevTools(id: string): void {
    const tab = this.tabs.get(id)
    if (tab) {
      if (tab.view.webContents.isDevToolsOpened()) {
        tab.view.webContents.closeDevTools()
      } else {
        tab.view.webContents.openDevTools({ mode: 'detach' })
      }
    }
  }

  setSidePanelWidth(width: number): void {
    this.sidePanelWidth = width
    this.updateBounds()
  }

  updateBounds(): void {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return

    const [width, height] = this.mainWindow.getContentSize()
    const topOffset = this.headerHeight + this.addressBarHeight

    tab.view.setBounds({
      x: 0,
      y: topOffset,
      width: Math.max(0, width - this.sidePanelWidth),
      height: height - topOffset
    })
  }

  getTabInfo(id: string): { title: string; url: string } | null {
    const tab = this.tabs.get(id)
    if (!tab) return null
    return { title: tab.title, url: tab.url }
  }

  destroyAll(): void {
    for (const [id, tab] of this.tabs) {
      this.mainWindow.removeBrowserView(tab.view)
      tab.view.webContents.close()
    }
    this.tabs.clear()
    this.activeTabId = null
  }
}

export function registerBrowserHandlers(
  mainWindow: BrowserWindow,
  tabManager: BrowserTabManager
): void {
  ipcMain.handle('browser:createTab', async (_event, { id, url }) => {
    await tabManager.createTab(id, url)
    return { success: true }
  })

  ipcMain.handle('browser:showTab', (_event, { id }) => {
    tabManager.showTab(id)
    return { success: true }
  })

  ipcMain.handle('browser:hideAll', () => {
    tabManager.hideAllTabs()
    return { success: true }
  })

  ipcMain.handle('browser:closeTab', (_event, { id }) => {
    tabManager.closeTab(id)
    return { success: true }
  })

  ipcMain.handle('browser:navigate', (_event, { id, url }) => {
    tabManager.navigate(id, url)
    return { success: true }
  })

  ipcMain.handle('browser:goBack', (_event, { id }) => {
    tabManager.goBack(id)
    return { success: true }
  })

  ipcMain.handle('browser:goForward', (_event, { id }) => {
    tabManager.goForward(id)
    return { success: true }
  })

  ipcMain.handle('browser:reload', (_event, { id }) => {
    tabManager.reload(id)
    return { success: true }
  })

  ipcMain.handle('browser:devtools', (_event, { id }) => {
    tabManager.openDevTools(id)
    return { success: true }
  })

  ipcMain.handle('browser:setProxyPort', (_event, { port }) => {
    tabManager.setProxyPort(port)
    return { success: true }
  })

  ipcMain.handle('browser:setSidePanelWidth', (_event, { width }) => {
    tabManager.setSidePanelWidth(width)
    return { success: true }
  })

  // Update bounds when window is resized
  mainWindow.on('resize', () => {
    tabManager.updateBounds()
  })
}
