import { useCallback, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import ProjectPanel from './ProjectPanel'
import SessionPanel from './SessionPanel'
import TerminalPanel from './TerminalPanel'
import { useWorkspaceStore } from '../../stores/workspace.store'

export default function HomePage() {
  const { activeWorkspaceId, workspaces } = useWorkspaceStore()
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [activePtyId, setActivePtyId] = useState<string | null>(null)

  // Resume session: send Ctrl+C first to interrupt any running codemaker, then resume
  const handleResumeSession = useCallback(
    (sessionId: string, _directory: string) => {
      if (!window.api || !activePtyId) return
      // Send Ctrl+C to interrupt any running codemaker process
      window.api.ptyWrite({ projectId: activePtyId, data: '\x03' })
      // Wait for interrupt to complete, then send resume command
      const ptyId = activePtyId
      setTimeout(() => {
        window.api!.ptyWrite({
          projectId: ptyId,
          data: `codemaker --session ${sessionId}\n`
        })
      }, 200)
    },
    [activePtyId]
  )

  return (
    <div className="h-full flex flex-col">
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
          <TerminalPanel
            onActivePtyIdChange={setActivePtyId}
            workspacePath={activeWorkspace?.path}
          />
        </Panel>
      </PanelGroup>
    </div>
  )
}
