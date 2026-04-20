import { useEffect, useState } from 'react'
import { useSessionStore } from '../../stores/session.store'
import { useProjectStore } from '../../stores/project.store'

type SessionFilter = 'all' | 'frontend' | 'backend'

interface SessionPanelProps {
  onResumeSession?: (sessionId: string, directory: string) => void
}

export default function SessionPanel({ onResumeSession }: SessionPanelProps) {
  const {
    sessions,
    selectedSessionId,
    parts,
    isLoading,
    dbExists,
    checkDb,
    loadSessions,
    selectSession
  } = useSessionStore()
  const { activeProjectId, projects } = useProjectStore()
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    checkDb()
  }, [checkDb])

  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Collect directories for the current filter
  const getDirectories = (f: SessionFilter): string[] => {
    if (!activeProject) return []
    const dirs: string[] = []
    if ((f === 'all' || f === 'frontend') && activeProject.frontend?.path) {
      dirs.push(activeProject.frontend.path)
    }
    if ((f === 'all' || f === 'backend') && activeProject.backends) {
      for (const be of activeProject.backends) {
        dirs.push(be.path)
      }
    }
    return dirs
  }

  // Load sessions when project or filter changes
  useEffect(() => {
    if (!dbExists || !activeProject) {
      loadSessions([])
      return
    }
    loadSessions(getDirectories(filter))
  }, [activeProjectId, dbExists, filter, projects, loadSessions])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)
  const hasFe = !!activeProject?.frontend
  const hasBe = activeProject?.backends && activeProject.backends.length > 0

  // --- Empty states ---

  if (!dbExists) {
    return (
      <div className="h-full flex flex-col bg-surface dark:bg-surface-dark">
        <Header count={0} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-xs text-gray-400 dark:text-gray-500 px-4">
            <p className="mb-2">CodeMaker CLI not detected</p>
            <p className="text-[10px]">Install CodeMaker CLI to view session history.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!activeProjectId) {
    return (
      <div className="h-full flex flex-col bg-surface dark:bg-surface-dark">
        <Header count={0} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">Select a project first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface dark:bg-surface-dark">
      <Header count={sessions.length} isLoading={isLoading} />

      {/* Search bar */}
      <div className="px-2 py-1.5 border-b border-border dark:border-border-dark">
        <div className="relative">
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-6 pr-6 py-1 text-[11px] rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      {(hasFe || hasBe) && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border dark:border-border-dark">
          <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          {hasFe && (
            <FilterTab label="Frontend" active={filter === 'frontend'} onClick={() => setFilter('frontend')} />
          )}
          {hasBe && (
            <FilterTab label="Backend" active={filter === 'backend'} onClick={() => setFilter('backend')} />
          )}
        </div>
      )}

      {/* Session List */}
      {(() => {
        const query = searchQuery.toLowerCase().trim()
        const filteredSessions = query
          ? sessions.filter((s) =>
              getTitle(s).toLowerCase().includes(query) ||
              s.slug.toLowerCase().includes(query) ||
              s.directory.toLowerCase().includes(query)
            )
          : sessions
        return (
      <div className={`overflow-y-auto ${selectedSessionId ? 'h-[50%]' : 'flex-1'}`}>
        <div className="px-2 py-2 space-y-1">
          {filteredSessions.length === 0 && !isLoading && (
            <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
              {query ? 'No matching sessions' : 'No sessions found'}
            </div>
          )}
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`
                p-2.5 rounded-md cursor-pointer transition-colors text-xs
                ${selectedSessionId === session.id
                  ? 'bg-accent/10 border border-accent/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'}
              `}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
                  {getTitle(session)}
                </span>
                <span className="text-[10px] text-gray-400 ml-2 whitespace-nowrap">
                  {formatTime(session.timeUpdated)}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 truncate font-mono">
                {session.directory.replace(/^\/Users\/\w+/, '~')}
              </div>
            </div>
          ))}
        </div>
      </div>
        )
      })()}

      {/* Preview area */}
      {selectedSession && (
        <div className="border-t border-border dark:border-border-dark flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between bg-surface dark:bg-surface-dark border-b border-border/50 dark:border-border-dark/50 shrink-0">
            <div className="flex-1 min-w-0 mr-2">
              <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                {getTitle(selectedSession)}
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">{selectedSession.id}</span>
            </div>
            <button
              onClick={() => onResumeSession?.(selectedSession.id, selectedSession.directory)}
              className="shrink-0 px-2.5 py-1 text-[11px] rounded bg-accent text-white hover:bg-accent-hover font-medium"
            >
              Resume
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {parts.length === 0 && !isLoading && (
              <p className="text-[11px] text-gray-400 italic">No text content</p>
            )}
            {parts.slice(0, 30).map((part) => (
              <div key={part.id} className="flex gap-2">
                <span className={`text-[10px] font-semibold mt-0.5 shrink-0 w-6 ${
                  part.role === 'user' ? 'text-blue-500'
                    : part.role === 'assistant' ? 'text-purple-500'
                    : 'text-gray-400'
                }`}>
                  {part.role === 'user' ? 'YOU' : part.role === 'assistant' ? 'AI' : '??'}
                </span>
                <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words min-w-0">
                  {part.text.length > 500 ? part.text.slice(0, 500) + '...' : part.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function Header({ count, isLoading }: { count: number; isLoading?: boolean }) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-border dark:border-border-dark">
      <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
        Sessions
      </h2>
      {count > 0 && (
        <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
      {isLoading && (
        <span className="ml-auto text-[10px] text-gray-400 animate-pulse">loading...</span>
      )}
    </div>
  )
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}

function getTitle(session: { title: string; slug: string }): string {
  if (session.title && !session.title.startsWith('New session -')) return session.title
  return session.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffH = diffMs / 3600000
  const diffD = diffMs / 86400000
  if (diffH < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m ago`
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  if (diffD < 7) return `${Math.round(diffD)}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
