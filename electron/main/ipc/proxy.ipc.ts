import { ipcMain, BrowserWindow } from 'electron'
import { ProxyServer, ProxyRule, ProxyLogEntry } from '../services/proxy-server'
import { parseSpringBootRoutes, ParsedRoute } from '../services/route-parser'
import { safeSend } from '../utils/safe-send'

let proxyServer: ProxyServer | null = null

export function registerProxyHandlers(mainWindow: BrowserWindow): void {
  // Start proxy server
  ipcMain.handle(
    'proxy:start',
    async (
      _event,
      {
        port,
        frontendPort,
        frontendHost,
        rules
      }: {
        port: number
        frontendPort: number
        frontendHost?: string
        rules: ProxyRule[]
      }
    ) => {
      try {
        if (proxyServer?.isRunning()) {
          await proxyServer.stop()
        }

        proxyServer = new ProxyServer(port)
        proxyServer.setFrontendTarget(frontendHost || 'localhost', frontendPort)
        proxyServer.setRules(rules)

        // Forward request logs to renderer
        proxyServer.on('request', (logEntry: ProxyLogEntry) => {
          safeSend(mainWindow, 'proxy:log', logEntry)
        })

        await proxyServer.start()
        return { success: true, port }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  // Stop proxy server
  ipcMain.handle('proxy:stop', async () => {
    if (proxyServer) {
      await proxyServer.stop()
      proxyServer = null
    }
    return { success: true }
  })

  // Update proxy rules
  ipcMain.handle('proxy:updateRules', (_event, rules: ProxyRule[]) => {
    if (proxyServer) {
      proxyServer.setRules(rules)
    }
    return { success: true }
  })

  // Get proxy status
  ipcMain.handle('proxy:status', () => {
    return {
      running: proxyServer?.isRunning() || false,
      port: proxyServer?.getPort() || 0
    }
  })

  // Parse Spring Boot routes
  ipcMain.handle('proxy:parseRoutes', async (_event, projectPath: string) => {
    try {
      const result = await parseSpringBootRoutes(projectPath)
      return { success: true, routes: result.routes, contextPath: result.contextPath }
    } catch (error) {
      return {
        success: false,
        routes: [],
        contextPath: '',
        error: error instanceof Error ? error.message : 'Parse error'
      }
    }
  })
}
