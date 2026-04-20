import { ChildProcess, spawn, execSync } from 'child_process'
import { EventEmitter } from 'events'
import * as os from 'os'
import * as net from 'net'

/**
 * Resolve the user's full shell PATH.
 *
 * When Electron is launched as a GUI app on macOS, process.env.PATH is the
 * minimal launchd PATH (e.g. /usr/bin:/bin:/usr/sbin:/sbin) and does NOT
 * include paths added in ~/.zshrc, ~/.bash_profile, etc.
 *
 * This function spawns a login shell to obtain the real PATH so that tools
 * like mvn, gradle, node, etc. can be found by child processes.
 */
function resolveShellPath(): string {
  if (os.platform() === 'win32') {
    return process.env.PATH || ''
  }

  try {
    const userShell = process.env.SHELL || '/bin/zsh'
    const result = execSync(`${userShell} -ilc 'echo -n "$PATH"'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return result.trim() || process.env.PATH || ''
  } catch {
    // Fallback: return the existing PATH if shell resolution fails
    return process.env.PATH || ''
  }
}

export interface ProcessInfo {
  id: string
  type: 'frontend' | 'backend'
  projectId: string
  command: string
  cwd: string
  port: number
  status: 'starting' | 'running' | 'stopped' | 'error'
  pid?: number
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, { info: ProcessInfo; process: ChildProcess }>()
  private resolvedPath: string

  constructor() {
    super()
    // Resolve once at construction time so we don't pay the cost on every spawn
    this.resolvedPath = resolveShellPath()
  }

  async startProcess(info: Omit<ProcessInfo, 'status' | 'pid'>): Promise<ProcessInfo> {
    const processKey = `${info.projectId}-${info.type}`

    // Kill existing process if any
    if (this.processes.has(processKey)) {
      await this.stopProcess(processKey)
    }

    const processInfo: ProcessInfo = { ...info, status: 'starting' }

    // Parse command
    const shell = os.platform() === 'win32' ? 'cmd' : '/bin/sh'
    const shellArgs = os.platform() === 'win32' ? ['/c', info.command] : ['-c', info.command]

    const child = spawn(shell, shellArgs, {
      cwd: info.cwd,
      env: { ...process.env, PATH: this.resolvedPath, FORCE_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    processInfo.pid = child.pid
    this.processes.set(processKey, { info: processInfo, process: child })

    // Forward stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      this.emit('output', { processKey, type: 'stdout', data: output })

      // Auto-detect when server is ready
      if (processInfo.status === 'starting') {
        if (
          output.includes('Started') ||
          output.includes('ready') ||
          output.includes('listening') ||
          output.includes('Local:') ||
          output.includes('localhost:')
        ) {
          processInfo.status = 'running'
          this.emit('status-changed', { processKey, status: 'running' })
        }
      }
    })

    // Forward stderr
    child.stderr?.on('data', (data: Buffer) => {
      this.emit('output', { processKey, type: 'stderr', data: data.toString() })
    })

    child.on('exit', (code) => {
      processInfo.status = code === 0 ? 'stopped' : 'error'
      this.emit('status-changed', { processKey, status: processInfo.status, exitCode: code })
      this.processes.delete(processKey)
    })

    child.on('error', (err) => {
      processInfo.status = 'error'
      this.emit('status-changed', { processKey, status: 'error', error: err.message })
      this.processes.delete(processKey)
    })

    // Wait a moment and check if port becomes available
    await this.waitForPort(info.port, 30000).catch(() => {
      // Timeout is ok, might still be starting
    })

    if (processInfo.status === 'starting') {
      processInfo.status = 'running'
      this.emit('status-changed', { processKey, status: 'running' })
    }

    return processInfo
  }

  async stopProcess(processKey: string): Promise<void> {
    const entry = this.processes.get(processKey)
    if (!entry) return

    const { process: child, info } = entry

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 5000)

      child.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      // Graceful shutdown
      if (os.platform() === 'win32') {
        child.kill()
      } else {
        child.kill('SIGTERM')
      }

      info.status = 'stopped'
      this.processes.delete(processKey)
    })
  }

  async stopAll(): Promise<void> {
    const keys = Array.from(this.processes.keys())
    await Promise.all(keys.map((key) => this.stopProcess(key)))
  }

  getProcessInfo(processKey: string): ProcessInfo | undefined {
    return this.processes.get(processKey)?.info
  }

  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values()).map((entry) => entry.info)
  }

  private waitForPort(port: number, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const check = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Port ${port} not available after ${timeout}ms`))
          return
        }

        const socket = new net.Socket()
        socket.setTimeout(1000)

        socket.on('connect', () => {
          socket.destroy()
          resolve()
        })

        socket.on('error', () => {
          socket.destroy()
          setTimeout(check, 500)
        })

        socket.on('timeout', () => {
          socket.destroy()
          setTimeout(check, 500)
        })

        socket.connect(port, 'localhost')
      }

      check()
    })
  }
}
