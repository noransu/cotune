import * as pty from 'node-pty'
import * as os from 'os'

export interface PtyInstance {
  id: string
  projectPath: string
  ptyProcess: pty.IPty
  cols: number
  rows: number
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()

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

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(cols, 1),
      rows: Math.max(rows, 1),
      cwd: projectPath,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      } as Record<string, string>
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

  writePty(projectId: string, data: string): void {
    const instance = this.ptys.get(projectId)
    if (instance) {
      instance.ptyProcess.write(data)
    }
  }

  resizePty(projectId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(projectId)
    if (instance) {
      instance.ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1))
      instance.cols = cols
      instance.rows = rows
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
