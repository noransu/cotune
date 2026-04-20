import { useCallback, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ProjectPanel from './ProjectPanel'
import SessionPanel from './SessionPanel'
import TerminalPanel from './TerminalPanel'
import { useProxyStore } from '../../stores/proxy.store'
import { useProjectStore } from '../../stores/project.store'

interface HomePageProps {
  onOpenBrowser?: (url: string) => void
}

export default function HomePage({ onOpenBrowser }: HomePageProps) {
  const { isRunning, startProxy, stopProxy, parseRoutes, rules } = useProxyStore()
  const { activeProjectId, projects, setProjectStatus } = useProjectStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const [activePtyId, setActivePtyId] = useState<string | null>(null)
  const [startingStatus, setStartingStatus] = useState<string | null>(null)

  const handleStartAll = async () => {
    if (!activeProject || !window.api) return

    try {
      // Start non-external backends only
      for (let i = 0; i < activeProject.backends.length; i++) {
        const be = activeProject.backends[i]

        // Always parse routes (even for external backends, we need proxy rules)
        if (be.framework === 'spring-boot') {
          setStartingStatus(`Parsing routes: ${be.name}...`)
          await parseRoutes(be.path, be.port, {
            contextPath: be.contextPath,
            apiPrefix: be.apiPrefix
          })
        }

        // Skip starting external backends (managed by IDEA/IntelliJ)
        if (be.external) continue

        setStartingStatus(`Starting backend: ${be.name}...`)
        await window.api.processStart({
          id: `${activeProject.id}-be-${i}`,
          type: 'backend',
          projectId: activeProject.id,
          command: be.command,
          cwd: be.path,
          port: be.port
        })
      }

      // Start frontend
      if (activeProject.frontend) {
        setStartingStatus('Starting frontend...')
        await window.api.processStart({
          id: `${activeProject.id}-fe`,
          type: 'frontend',
          projectId: activeProject.id,
          command: activeProject.frontend.command,
          cwd: activeProject.frontend.path,
          port: activeProject.frontend.port
        })
      }

      // Start proxy if we have both FE and at least one BE
      if (activeProject.frontend && activeProject.backends.length > 0) {
        setStartingStatus('Starting proxy...')
        const proxyOk = await startProxy(activeProject.frontend.port, activeProject.backends[0].port)
        if (!proxyOk) {
          setStartingStatus('Proxy failed to start!')
          setTimeout(() => setStartingStatus(null), 5000)
          setProjectStatus(activeProject.id, 'error')
          return
        }
      }

      setProjectStatus(activeProject.id, 'running')
      setStartingStatus(null)

      // Auto-open browser tab after a delay to let frontend dev server fully initialize
      if (onOpenBrowser && activeProject.frontend) {
        const port = activeProject.backends.length > 0
          ? activeProject.proxyPort   // Use proxy port when both FE and BE exist
          : activeProject.frontend.port // Use frontend port directly if no backend
        setTimeout(() => {
          onOpenBrowser(`http://localhost:${port}`)
        }, 1000)
      }
    } catch (err) {
      setStartingStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setTimeout(() => setStartingStatus(null), 5000)
      setProjectStatus(activeProject.id, 'error')
    }
  }

  const handleStopAll = async () => {
    if (!activeProject || !window.api) return
    await window.api.processStopAll()
    await stopProxy()
    setProjectStatus(activeProject.id, 'stopped')
  }

  const handleResumeSession = useCallback(
    (sessionId: string, _directory: string) => {
      if (!window.api || !activePtyId) return
      window.api.ptyWrite({ projectId: activePtyId, data: `codemaker --session ${sessionId}\n` })
    },
    [activePtyId]
  )

  return (
    <div className="h-full flex flex-col">
      {/* Control bar */}
      {activeProject && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-panel dark:bg-panel-dark border-b border-border dark:border-border-dark">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {activeProject.name}
          </span>
          <button
            onClick={activeProject.status === 'running' ? handleStopAll : handleStartAll}
            disabled={!!startingStatus}
            className={`px-3 py-1 text-[11px] rounded font-medium ${
              startingStatus
                ? 'bg-gray-500/10 text-gray-400 cursor-wait'
                : activeProject.status === 'running'
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
            }`}
          >
            {startingStatus || (activeProject.status === 'running' ? 'Stop All' : 'Start All')}
          </button>

          <div className="ml-auto flex items-center gap-3 text-[10px]">
            {activeProject.backends.map((be, i) => (
              <span key={i} className={`${be.external ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {be.name} :{be.port}{be.external ? ' (ext)' : ''}
              </span>
            ))}
            {activeProject.frontend && (
              <span className="text-gray-500 dark:text-gray-400">
                FE :{activeProject.frontend.port}
              </span>
            )}
            {isRunning && (
              <span className="text-green-500" title={`Proxy :${activeProject.proxyPort} → FE :${activeProject.frontend?.port || '?'}, ${rules.filter(r => r.enabled).length} API routes → BE`}>
                Proxy :{activeProject.proxyPort}
              </span>
            )}
            {rules.length > 0 && (
              <span className="text-gray-400" title={rules.slice(0, 5).map(r => `${r.method} ${r.pathPattern} → :${r.targetPort}`).join('\n')}>
                {rules.filter((r) => r.enabled).length} routes
              </span>
            )}
          </div>
        </div>
      )}

      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <ProjectPanel />
        </Panel>
        <PanelResizeHandle className="w-[1px] bg-border dark:bg-border-dark hover:bg-accent transition-colors" />
        <Panel defaultSize={30} minSize={20} maxSize={50}>
          <SessionPanel onResumeSession={handleResumeSession} />
        </Panel>
        <PanelResizeHandle className="w-[1px] bg-border dark:bg-border-dark hover:bg-accent transition-colors" />
        <Panel defaultSize={50} minSize={30}>
          <TerminalPanel onActivePtyIdChange={setActivePtyId} />
        </Panel>
      </PanelGroup>
    </div>
  )
}
