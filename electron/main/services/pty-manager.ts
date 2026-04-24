import * as pty from 'node-pty'
import * as os from 'os'
import { execSync } from 'child_process'

export interface PtyInstance {
  id: string
  projectPath: string
  ptyProcess: pty.IPty
  cols: number
  rows: number
}

/**
 * Resolve the user's full shell PATH.
 *
 * When Electron is launched as a GUI app on macOS, process.env.PATH is the
 * minimal launchd PATH. This function spawns a login shell to get the real PATH.
 */
function resolveShellPath(): string {
  if (os.platform() === 'win32') return process.env.PATH || ''
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
    return process.env.PATH || ''
  }
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private resolvedPath: string

  constructor() {
    this.resolvedPath = resolveShellPath()
  }

  createPty(
    projectId: string,
    projectPath: string,
    cols: number,
    rows: number
  ): PtyInstance {
    // Destroy existing PTY for this project if any
    if (this.ptys.has(projectId)) {
      this.destroyPty(projectId)
    }

    const shell =
      os.platform() === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh'

    // Ensure UTF-8 locale is set for CJK character support.
    // On macOS, Electron GUI apps often inherit a minimal environment
    // where LANG / LC_CTYPE are missing, causing multibyte garbling.
    const lang = process.env.LANG || 'en_US.UTF-8'

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      PATH: this.resolvedPath || process.env.PATH || '',
      LANG: lang,
      LC_CTYPE: process.env.LC_CTYPE || lang,
      LC_ALL: process.env.LC_ALL || ''
    }

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(cols, 1),
      rows: Math.max(rows, 1),
      cwd: projectPath,
      env,
      encoding: 'utf8'
    })

    const instance: PtyInstance = {
      id: projectId,
      projectPath,
      ptyProcess,
      cols,
      rows
    }

    this.ptys.set(projectId, instance)
    return instance
  }

  getPty(projectId: string): PtyInstance | undefined {
    return this.ptys.get(projectId)
  }

  writePty(projectId: string, data: string): boolean {
    const instance = this.ptys.get(projectId)
    if (instance) {
      try {
        instance.ptyProcess.write(data)
        return true
      } catch (err) {
        console.error(`[PTY] Write failed for ${projectId}:`, err)
        return false
      }
    }
    console.warn(`[PTY] No PTY found for ${projectId}, write ignored`)
    return false
  }

  resizePty(projectId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(projectId)
    if (instance) {
      try {
        instance.ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1))
        instance.cols = cols
        instance.rows = rows
      } catch (err) {
        console.error(`[PTY] Resize failed for ${projectId}:`, err)
      }
    }
  }

  destroyPty(projectId: string): void {
    const instance = this.ptys.get(projectId)
    if (instance) {
      try {
        instance.ptyProcess.kill()
      } catch {
        // PTY may already be dead
      }
      this.ptys.delete(projectId)
    }
  }

  destroyAll(): void {
    for (const [, instance] of this.ptys) {
      try {
        instance.ptyProcess.kill()
      } catch {
        // ignore
      }
    }
    this.ptys.clear()
  }

  hasPty(projectId: string): boolean {
    return this.ptys.has(projectId)
  }
}
