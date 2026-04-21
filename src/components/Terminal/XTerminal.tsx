import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface XTerminalProps {
  projectId: string
  projectPath?: string
}

export default function XTerminal({ projectId, projectPath }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const disposeRef = useRef<(() => void)[]>([])

  useEffect(() => {
    if (!containerRef.current || !window.api) return

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      scrollback: 10000,
      allowProposedApi: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b7066',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8'
      }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Open terminal in DOM
    terminal.open(containerRef.current)
    fitAddon.fit()

    // Create PTY process
    const cwd = projectPath || '/'
    window.api
      .ptyCreate({
        projectId,
        projectPath: cwd,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .then((result) => {
        if (result && result.success === false) {
          terminal.writeln(
            `\r\n\x1b[31m[Error] Failed to create terminal: ${result.error || 'Unknown error'}\x1b[0m`
          )
          terminal.writeln(
            '\x1b[33m[Hint] Native modules may need rebuilding: npm run rebuild\x1b[0m'
          )
          return
        }

        // Listen for PTY data
        const disposeData = window.api.onPtyData(projectId, (data) => {
          terminal.write(data)
        })
        disposeRef.current.push(disposeData)

        // Listen for PTY exit
        const disposeExit = window.api.onPtyExit(projectId, ({ exitCode }) => {
          terminal.writeln(
            `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`
          )
        })
        disposeRef.current.push(disposeExit)
      })
      .catch((err) => {
        terminal.writeln(
          `\r\n\x1b[31m[Error] Terminal initialization failed: ${err?.message || err}\x1b[0m`
        )
      })

    // Forward user input to PTY
    const disposeInput = terminal.onData((data) => {
      window.api.ptyWrite({ projectId, data })
    })

    // Forward resize to PTY
    const disposeResize = terminal.onResize(({ cols, rows }) => {
      window.api.ptyResize({ projectId, cols, rows })
    })

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // ignore fit errors during unmount
        }
      })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      disposeInput.dispose()
      disposeResize.dispose()
      disposeRef.current.forEach((fn) => fn())
      disposeRef.current = []
      terminal.dispose()
      window.api.ptyDestroy({ projectId })
    }
  }, [projectId, projectPath])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: '4px 8px' }}
    />
  )
}
