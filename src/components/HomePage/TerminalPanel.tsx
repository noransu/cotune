import { useEffect, useRef, useState, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace.store'
import XTerminal from '../Terminal/XTerminal'

interface ProcessLog {
  processKey: string
  label: string
  lines: string[]
}

interface ShellTab {
  id: string
  label: string
}

interface WsTermState {
  shells: ShellTab[]
  activeShellId: string
  path: string
}

let shellCounter = 0

interface TerminalPanelProps {
  onActivePtyIdChange?: (ptyId: string) => void
  workspaceId?: string | null
  workspacePath?: string
}

export default function TerminalPanel({
  onActivePtyIdChange,
  workspaceId,
  workspacePath
}: TerminalPanelProps) {
  const { workspaces } = useWorkspaceStore()
  const [isReady, setIsReady] = useState(false)

  // Per-workspace terminal state: each workspace has its own shell tabs
  const [wsTerminals, setWsTerminals] = useState<Record<string, WsTermState>>({})

  // Process logs (shared, from debug page services)
  const [processLogs, setProcessLogs] = useState<Map<string, ProcessLog>>(new Map())
  // Whether a process log tab is selected (overrides shell view)
  const [activeProcessTab, setActiveProcessTab] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const currentWsId = workspaceId || ''

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // ── Ensure current workspace has terminal state ────────────────────
  useEffect(() => {
    if (!currentWsId || !workspacePath) return
    setWsTerminals((prev) => {
      if (prev[currentWsId]) return prev // already initialized
      const shellId = `shell-${++shellCounter}`
      return {
        ...prev,
        [currentWsId]: {
          shells: [{ id: shellId, label: 'Shell' }],
          activeShellId: shellId,
          path: workspacePath
        }
      }
    })
  }, [currentWsId, workspacePath])

  // ── Clean up PTYs for deleted workspaces ───────────────────────────
  useEffect(() => {
    const validIds = new Set(workspaces.map((w) => w.id))
    const toRemove: string[] = []
    for (const wsId of Object.keys(wsTerminals)) {
      if (!validIds.has(wsId)) {
        // Workspace was deleted — destroy its PTYs
        for (const shell of wsTerminals[wsId].shells) {
          window.api?.ptyDestroy({ projectId: `${wsId}-${shell.id}` })
        }
        toRemove.push(wsId)
      }
    }
    if (toRemove.length > 0) {
      setWsTerminals((prev) => {
        const next = { ...prev }
        for (const id of toRemove) delete next[id]
        return next
      })
    }
  }, [workspaces]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent of active PTY ID ─────────────────────────────────
  useEffect(() => {
    const wsTerm = wsTerminals[currentWsId]
    if (wsTerm && onActivePtyIdChange && !activeProcessTab) {
      onActivePtyIdChange(`${currentWsId}-${wsTerm.activeShellId}`)
    }
  }, [currentWsId, wsTerminals, onActivePtyIdChange, activeProcessTab])

  // ── Process output listeners (for debug page compatibility) ────────
  useEffect(() => {
    if (!window.api) return

    const disposeOutput = window.api.onProcessOutput(
      ({ processKey, data }: { processKey: string; type: string; data: string }) => {
        setProcessLogs((prev) => {
          const next = new Map(prev)
          const existing = next.get(processKey) || { processKey, label: processKey, lines: [] }
          const newLines = data.split('\n')
          existing.lines = [...existing.lines.slice(-500), ...newLines]
          next.set(processKey, existing)
          return next
        })
      }
    )

    const disposeStatus = window.api.onProcessStatus(
      ({
        processKey,
        status,
        exitCode,
        error
      }: {
        processKey: string
        status: string
        exitCode?: number
        error?: string
      }) => {
        if (status === 'stopped' && !error && exitCode === undefined) {
          setProcessLogs((prev) => {
            const next = new Map(prev)
            next.delete(processKey)
            return next
          })
          setActiveProcessTab((current) => (current === processKey ? null : current))
          return
        }
        setProcessLogs((prev) => {
          const next = new Map(prev)
          const existing: ProcessLog = next.get(processKey) || {
            processKey,
            label: processKey,
            lines: []
          }
          if (status === 'error' || error) {
            existing.lines.push(`[ERROR] ${error || `Process exited with code ${exitCode}`}`)
          } else if (exitCode !== undefined) {
            existing.lines.push(`[Process exited with code ${exitCode}]`)
          }
          next.set(processKey, existing)
          return next
        })
      }
    )

    return () => {
      disposeOutput()
      disposeStatus()
    }
  }, [])

  // Auto-scroll process log view
  useEffect(() => {
    if (activeProcessTab) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [processLogs, activeProcessTab])

  // ── Destroy all PTYs on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const wsTerm of Object.values(wsTerminals)) {
        for (const shell of wsTerm.shells) {
          // Use the wsId from the closure
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref for cleanup on unmount
  const wsTerminalsRef = useRef(wsTerminals)
  wsTerminalsRef.current = wsTerminals
  useEffect(() => {
    return () => {
      // Destroy all PTYs when TerminalPanel unmounts
      for (const [wsId, wsTerm] of Object.entries(wsTerminalsRef.current)) {
        for (const shell of wsTerm.shells) {
          window.api?.ptyDestroy({ projectId: `${wsId}-${shell.id}` })
        }
      }
    }
  }, [])

  // ── Current workspace helpers ──────────────────────────────────────
  const currentWsTerm = wsTerminals[currentWsId]
  const currentShells = currentWsTerm?.shells || []
  const currentActiveShellId = currentWsTerm?.activeShellId || ''
  const terminalPath = currentWsTerm?.path || workspacePath

  // Is the active tab a shell or a process log?
  const isViewingShell = !activeProcessTab

  const setCurrentActiveShell = useCallback(
    (shellId: string) => {
      setActiveProcessTab(null)
      setWsTerminals((prev) => {
        const wsTerm = prev[currentWsId]
        if (!wsTerm) return prev
        return { ...prev, [currentWsId]: { ...wsTerm, activeShellId: shellId } }
      })
    },
    [currentWsId]
  )

  // Add new shell tab to current workspace
  const handleAddShell = useCallback(() => {
    if (!currentWsId) return
    const shellId = `shell-${++shellCounter}`
    setActiveProcessTab(null)
    setWsTerminals((prev) => {
      const wsTerm = prev[currentWsId]
      if (!wsTerm) return prev
      const num = wsTerm.shells.length + 1
      return {
        ...prev,
        [currentWsId]: {
          ...wsTerm,
          shells: [...wsTerm.shells, { id: shellId, label: `Shell ${num}` }],
          activeShellId: shellId
        }
      }
    })
  }, [currentWsId])

  // Close a shell tab in current workspace
  const handleCloseShell = useCallback(
    (tabId: string) => {
      if (!currentWsId) return
      const wsTerm = wsTerminals[currentWsId]
      if (!wsTerm || wsTerm.shells.length <= 1) return

      // Destroy the PTY for this shell
      window.api?.ptyDestroy({ projectId: `${currentWsId}-${tabId}` })

      setWsTerminals((prev) => {
        const ws = prev[currentWsId]
        if (!ws) return prev
        const remaining = ws.shells.filter((t) => t.id !== tabId)
        const newActive = ws.activeShellId === tabId ? remaining[0]?.id || '' : ws.activeShellId
        return { ...prev, [currentWsId]: { ...ws, shells: remaining, activeShellId: newActive } }
      })
    },
    [currentWsId, wsTerminals]
  )

  const processTabs = Array.from(processLogs.values())
  const activeLog = activeProcessTab ? processLogs.get(activeProcessTab) : null

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e]">
      {/* Terminal tabs — only show current workspace's tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-[#181825] border-b border-[#313244] overflow-x-auto">
        {/* Shell tabs for current workspace */}
        {currentShells.map((tab) => (
          <TabBtn
            key={tab.id}
            label={tab.label}
            icon={<TerminalIcon />}
            active={isViewingShell && currentActiveShellId === tab.id}
            onClick={() => setCurrentActiveShell(tab.id)}
            onClose={currentShells.length > 1 ? () => handleCloseShell(tab.id) : undefined}
          />
        ))}

        {/* Add shell button */}
        <button
          onClick={handleAddShell}
          className="flex items-center justify-center w-5 h-5 rounded text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2e]/50 transition-colors shrink-0"
          title="New Shell"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Separator */}
        {processTabs.length > 0 && (
          <div className="w-[1px] h-3.5 bg-[#313244] mx-1 shrink-0" />
        )}

        {/* Process output tabs */}
        {processTabs.map((log) => (
          <TabBtn
            key={log.processKey}
            label={formatTabLabel(log.processKey)}
            active={activeProcessTab === log.processKey}
            onClick={() => setActiveProcessTab(log.processKey)}
            hasError={log.lines.some(
              (l) => l.includes('[ERROR]') || l.includes('Exception')
            )}
          />
        ))}

        {/* Right: path info */}
        <div className="ml-auto flex items-center gap-2">
          {terminalPath && (
            <span className="text-[10px] text-gray-500 font-mono truncate max-w-[180px]">
              {terminalPath.replace(/^\/Users\/\w+/, '~')}
            </span>
          )}
        </div>
      </div>

      {/* Content area — all terminals rendered, only active one visible */}
      <div className="flex-1 overflow-hidden relative">
        {isReady &&
          Object.entries(wsTerminals).map(([wsId, wsTerm]) =>
            wsTerm.shells.map((tab) => {
              const ptyId = `${wsId}-${tab.id}`
              const isVisible =
                isViewingShell && wsId === currentWsId && tab.id === wsTerm.activeShellId

              return (
                <div
                  key={ptyId}
                  className={`absolute inset-0 ${isVisible ? '' : 'invisible'}`}
                >
                  <XTerminal projectId={ptyId} projectPath={wsTerm.path} />
                </div>
              )
            })
          )}

        {/* Process log viewer */}
        {activeLog && (
          <div className="absolute inset-0 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
            {activeLog.lines.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${
                  line.includes('[ERROR]') ||
                  line.includes('Exception') ||
                  line.includes('Error')
                    ? 'text-red-400'
                    : line.includes('[WARN]') || line.includes('WARNING')
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                }`}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* No workspace selected */}
        {!currentWsId && !activeLog && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Select a project to open a terminal
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Tab button
// ============================================================================

function TabBtn({
  label,
  icon,
  active,
  onClick,
  onClose,
  hasError
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
  onClose?: () => void
  hasError?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`group/tab flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors shrink-0 ${
        active
          ? 'bg-[#1e1e2e] text-gray-200'
          : 'text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2e]/50'
      }`}
    >
      {icon}
      <span>{label}</span>
      {hasError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
      {onClose && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-[#313244] text-gray-400 hover:text-gray-200 transition-opacity"
        >
          <svg
            width="7"
            height="7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      )}
    </button>
  )
}

function formatTabLabel(processKey: string): string {
  if (processKey.includes('-fe')) return 'FE Output'
  const beMatch = processKey.match(/-be-(\d+)/)
  if (beMatch) return `BE ${parseInt(beMatch[1]) + 1} Output`
  return processKey.split('-').pop() || processKey
}

function TerminalIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-current"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
