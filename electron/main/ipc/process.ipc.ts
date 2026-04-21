import { ipcMain, BrowserWindow } from 'electron'
import { ProcessManager } from '../services/process-manager'
import { safeSend } from '../utils/safe-send'

const processManager = new ProcessManager()

export function registerProcessHandlers(mainWindow: BrowserWindow): void {
  // Forward process output to renderer
  processManager.on('output', ({ processKey, type, data }) => {
    safeSend(mainWindow, 'process:output', { processKey, type, data })
  })

  processManager.on('status-changed', ({ processKey, status, exitCode, error }) => {
    safeSend(mainWindow, 'process:status', { processKey, status, exitCode, error })
  })

  // Start a process
  ipcMain.handle(
    'process:start',
    async (
      _event,
      {
        id,
        type,
        projectId,
        command,
        cwd,
        port
      }: {
        id: string
        type: 'frontend' | 'backend'
        projectId: string
        command: string
        cwd: string
        port: number
      }
    ) => {
      try {
        const info = await processManager.startProcess({
          id,
          type,
          projectId,
          command,
          cwd,
          port
        })
        return { success: true, info }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start'
        }
      }
    }
  )

  // Stop a process
  ipcMain.handle('process:stop', async (_event, processKey: string) => {
    try {
      await processManager.stopProcess(processKey)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop'
      }
    }
  })

  // Stop all processes
  ipcMain.handle('process:stopAll', async () => {
    await processManager.stopAll()
    return { success: true }
  })

  // Get all process info
  ipcMain.handle('process:list', () => {
    return processManager.getAllProcesses()
  })
}

export { processManager }
