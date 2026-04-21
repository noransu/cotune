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
  const { startProxy, stopProxy, parseRoutes } = useProxyStore()
  const { activeProjectId, projects, setProjectStatus, setServiceStatus } = useProjectStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const [activePtyId, setActivePtyId] = useState<string | null>(null)
  const [startingStatus, setStartingStatus] = useState<string | null>(null)

  // ── Per-service start/stop (called from ProjectPanel) ─────────────────

  const handleStartService = useCallback(async (projectId: string, serviceKey: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project || !window.api) return

    try {
      if (serviceKey === 'frontend' && project.frontend) {
        setServiceStatus(projectId, 'frontend', 'starting')
        await window.api.processStart({
          id: `${projectId}-fe`,
          type: 'frontend',
          projectId,
          command: project.frontend.command,
          cwd: project.frontend.path,
          port: project.frontend.port
        })
        setServiceStatus(projectId, 'frontend', 'running')
      }

      const beMatch = serviceKey.match(/^be-(\d+)$/)
      if (beMatch) {
        const idx = parseInt(beMatch[1])
        const be = project.backends[idx]
        if (!be || be.external) return

        setServiceStatus(projectId, serviceKey, 'starting')

        if (be.framework === 'spring-boot') {
          // Use modulePath (submodule dir) for route scanning, fallback to root path
          const scanPath = be.modulePath || be.path
          await parseRoutes(scanPath, be.port, {
            contextPath: be.contextPath,
            apiPrefix: be.apiPrefix
          })
        }

        await window.api.processStart({
          id: `${projectId}-be-${idx}`,
          type: 'backend',
          projectId,
          command: be.command,
          cwd: be.path,  // cwd stays as root (Maven -pl needs root)
          port: be.port
        })
        setServiceStatus(projectId, serviceKey, 'running')
      }

      deriveProjectStatus(projectId)
    } catch (err) {
      setServiceStatus(projectId, serviceKey, 'error')
    }
  }, [projects, setServiceStatus, parseRoutes])

  const handleStopService = useCallback(async (projectId: string, serviceKey: string) => {
    if (!window.api) return
    try {
      if (serviceKey === 'frontend') {
        await window.api.processStop(`${projectId}-fe`)
        setServiceStatus(projectId, 'frontend', 'stopped')
      }
      const beMatch = serviceKey.match(/^be-(\d+)$/)
      if (beMatch) {
        const idx = parseInt(beMatch[1])
        await window.api.processStop(`${projectId}-be-${idx}`)
        setServiceStatus(projectId, serviceKey, 'stopped')
      }
      deriveProjectStatus(projectId)
    } catch {
      // ignore
    }
  }, [setServiceStatus])

  // ── Per-project start all / stop all (called from ProjectPanel) ───────

  const handleStartProject = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project || !window.api) return

    try {
      // Start non-external backends
      for (let i = 0; i < project.backends.length; i++) {
        const be = project.backends[i]

        if (be.framework === 'spring-boot') {
          setStartingStatus(`Parsing routes: ${be.name}...`)
          const scanPath = be.modulePath || be.path
          await parseRoutes(scanPath, be.port, {
            contextPath: be.contextPath,
            apiPrefix: be.apiPrefix
          })
        }

        if (be.external) continue

        setServiceStatus(projectId, `be-${i}`, 'starting')
        setStartingStatus(`Starting: ${be.name}...`)
        await window.api.processStart({
          id: `${projectId}-be-${i}`,
          type: 'backend',
          projectId,
          command: be.command,
          cwd: be.path,
          port: be.port
        })
        setServiceStatus(projectId, `be-${i}`, 'running')
      }

      // Start frontend
      if (project.frontend) {
        setServiceStatus(projectId, 'frontend', 'starting')
        setStartingStatus('Starting frontend...')
        await window.api.processStart({
          id: `${projectId}-fe`,
          type: 'frontend',
          projectId,
          command: project.frontend.command,
          cwd: project.frontend.path,
          port: project.frontend.port
        })
        setServiceStatus(projectId, 'frontend', 'running')
      }

      // Start proxy
      if (project.frontend && project.backends.length > 0) {
        setStartingStatus('Starting proxy...')
        const proxyOk = await startProxy(project.frontend.port, project.backends[0].port)
        if (!proxyOk) {
          setStartingStatus('Proxy failed!')
          setTimeout(() => setStartingStatus(null), 3000)
          setProjectStatus(projectId, 'error')
          return
        }
      }

      setProjectStatus(projectId, 'running')
      setStartingStatus(null)

      if (onOpenBrowser && project.frontend) {
        const port = project.backends.length > 0 ? project.proxyPort : project.frontend.port
        setTimeout(() => onOpenBrowser(`http://localhost:${port}`), 1000)
      }
    } catch (err) {
      setStartingStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`)
      setTimeout(() => setStartingStatus(null), 3000)
      setProjectStatus(projectId, 'error')
    }
  }, [projects, setServiceStatus, setProjectStatus, parseRoutes, startProxy, onOpenBrowser])

  const handleStopProject = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project || !window.api) return

    await window.api.processStopAll()
    await stopProxy()

    if (project.frontend) setServiceStatus(projectId, 'frontend', 'stopped')
    for (let i = 0; i < project.backends.length; i++) {
      setServiceStatus(projectId, `be-${i}`, 'stopped')
    }
    setProjectStatus(projectId, 'stopped')
  }, [projects, setServiceStatus, setProjectStatus, stopProxy])

  // Derive overall project status from its services
  const deriveProjectStatus = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return
    const statuses: string[] = []
    if (project.frontend?.serviceStatus) statuses.push(project.frontend.serviceStatus)
    for (const be of project.backends) {
      if (be.serviceStatus) statuses.push(be.serviceStatus)
    }
    if (statuses.some((s) => s === 'running' || s === 'starting')) {
      setProjectStatus(projectId, 'running')
    } else if (statuses.some((s) => s === 'error')) {
      setProjectStatus(projectId, 'error')
    } else {
      setProjectStatus(projectId, 'stopped')
    }
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
      {/* Thin status bar — only shows when something is running */}
      {activeProject && startingStatus && (
        <div className="flex items-center px-4 py-1 bg-panel dark:bg-panel-dark border-b border-border dark:border-border-dark text-[11px] text-gray-500">
          <span className="animate-pulse">{startingStatus}</span>
        </div>
      )}

      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <ProjectPanel
            onStartProject={handleStartProject}
            onStopProject={handleStopProject}
            onStartService={handleStartService}
            onStopService={handleStopService}
          />
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
