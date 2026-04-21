import { useState, useEffect } from 'react'
import { useProxyStore, ProxyRule, ProxyLogEntry } from '../../stores/proxy.store'

const PANEL_WIDTH = 321 // 320px panel + 1px border

interface BrowserPageProps {
  tabId: string
  url: string
}

export default function BrowserPage({ tabId, url }: BrowserPageProps) {
  const [addressValue, setAddressValue] = useState(url)
  const { rules, logs, isRunning } = useProxyStore()
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    setAddressValue(url)
  }, [url])

  // Sync side panel width with main process so BrowserView bounds adjust
  useEffect(() => {
    const width = showPanel ? PANEL_WIDTH : 0
    window.api.browserSetSidePanelWidth({ width })
  }, [showPanel])

  // Reset panel width on unmount (e.g., when closing the browser tab)
  useEffect(() => {
    return () => {
      window.api.browserSetSidePanelWidth({ width: 0 })
    }
  }, [])

  // F12 shortcut to toggle DevTools
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault()
        window.api.browserDevTools({ id: tabId })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabId])

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault()
    if (addressValue.trim()) {
      window.api.browserNavigate({ id: tabId, url: addressValue.trim() })
    }
  }

  const enabledRules = rules.filter((r) => r.enabled)

  return (
    <div className="h-full flex flex-col">
      {/* Address bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-panel dark:bg-panel-dark border-b border-border dark:border-border-dark">
        {/* Navigation buttons */}
        <button
          onClick={() => window.api.browserGoBack({ id: tabId })}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Back"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={() => window.api.browserGoForward({ id: tabId })}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Forward"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          onClick={() => window.api.browserReload({ id: tabId })}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Reload"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>

        {/* URL input */}
        <form onSubmit={handleNavigate} className="flex-1">
          <input
            type="text"
            value={addressValue}
            onChange={(e) => setAddressValue(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-full border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-800 dark:text-gray-200 focus:outline-none focus:border-accent font-mono"
            placeholder="Enter URL or localhost:3000"
          />
        </form>

        {/* Routes / Proxy toggle button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
            showPanel
              ? 'bg-accent/15 text-accent border border-accent/30'
              : isRunning
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Toggle route mappings panel"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
          {enabledRules.length > 0 ? `${enabledRules.length} Routes` : 'Proxy'}
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform ${showPanel ? 'rotate-180' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* DevTools button */}
        <button
          onClick={() => window.api.browserDevTools({ id: tabId })}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Open DevTools (F12)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
      </div>

      {/* Main content area: browser view + optional side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* BrowserView renders here (managed by main process) */}
        <div className="flex-1 bg-white dark:bg-gray-900">
          {!url && (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <p className="text-sm mb-2">Enter a URL to start browsing</p>
                <p className="text-xs opacity-60">
                  Requests matching backend routes will be proxied automatically
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Side panel: route mappings + live logs (always mounted, animated via width) */}
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
            showPanel ? 'w-80 border-l border-border dark:border-border-dark' : 'w-0'
          }`}
        >
          <div className="w-80 h-full bg-panel dark:bg-panel-dark flex flex-col">
            <RoutesPanel rules={enabledRules} logs={logs} isRunning={isRunning} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Routes side panel
// ============================================================================

function RoutesPanel({
  rules,
  logs,
  isRunning
}: {
  rules: ProxyRule[]
  logs: ProxyLogEntry[]
  isRunning: boolean
}) {
  const [tab, setTab] = useState<'routes' | 'logs'>('routes')
  const [filter, setFilter] = useState('')

  const filteredRules = filter
    ? rules.filter(
        (r) =>
          r.pathPattern.toLowerCase().includes(filter.toLowerCase()) ||
          (r.description || '').toLowerCase().includes(filter.toLowerCase())
      )
    : rules

  // Group rules by class (description is "ClassName.methodName")
  const grouped = new Map<string, ProxyRule[]>()
  for (const rule of filteredRules) {
    const cls = rule.description?.split('.')[0] || 'Other'
    if (!grouped.has(cls)) grouped.set(cls, [])
    grouped.get(cls)!.push(rule)
  }

  return (
    <>
      {/* Panel tabs */}
      <div className="flex items-center border-b border-border dark:border-border-dark">
        <TabBtn label="Routes" count={rules.length} active={tab === 'routes'} onClick={() => setTab('routes')} />
        <TabBtn label="Logs" count={logs.length} active={tab === 'logs'} onClick={() => setTab('logs')} />
        <div className="flex-1" />
        <div className={`w-1.5 h-1.5 rounded-full mr-3 ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`} title={isRunning ? 'Proxy running' : 'Proxy stopped'} />
      </div>

      {tab === 'routes' ? (
        <>
          {/* Search */}
          <div className="px-2 py-1.5 border-b border-border dark:border-border-dark">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter routes..."
              className="w-full px-2 py-1 text-[10px] rounded border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-accent font-mono"
            />
          </div>

          {/* Route list grouped by controller */}
          <div className="flex-1 overflow-y-auto">
            {rules.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-gray-400">
                No routes loaded. Start a Spring Boot backend to scan routes.
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-gray-400">
                No routes match &quot;{filter}&quot;
              </div>
            ) : (
              Array.from(grouped.entries()).map(([cls, clsRules]) => (
                <ControllerGroup key={cls} className={cls} rules={clsRules} />
              ))
            )}
          </div>
        </>
      ) : (
        /* Logs tab */
        <div className="flex-1 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-gray-400">
              {isRunning ? 'Waiting for requests...' : 'Proxy not running'}
            </div>
          ) : (
            <div className="divide-y divide-border dark:divide-border-dark">
              {logs.slice(0, 100).map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function TabBtn({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${
        active
          ? 'text-accent border-b-2 border-accent'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1 px-1 py-px rounded-full text-[9px] ${
          active ? 'bg-accent/15 text-accent' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

function ControllerGroup({ className, rules }: { className: string; rules: ProxyRule[] }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border-b border-border dark:border-border-dark">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="currentColor"
          className={`text-gray-400 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        >
          <polygon points="6,4 20,12 6,20" />
        </svg>
        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate flex-1">
          {className}
        </span>
        <span className="text-[9px] text-gray-400 shrink-0">{rules.length}</span>
      </button>

      {!collapsed && (
        <div className="pb-1">
          {rules.map((rule, i) => (
            <RouteRow key={i} rule={rule} />
          ))}
        </div>
      )}
    </div>
  )
}

function RouteRow({ rule }: { rule: ProxyRule }) {
  const methodColors: Record<string, string> = {
    GET: 'text-green-500',
    POST: 'text-blue-500',
    PUT: 'text-amber-500',
    DELETE: 'text-red-500',
    PATCH: 'text-purple-500',
    '*': 'text-gray-400'
  }
  const methodName = rule.description?.split('.')[1] || ''

  return (
    <div className="flex items-center gap-1 px-2.5 pl-6 py-0.5 text-[10px] font-mono hover:bg-gray-50 dark:hover:bg-gray-800/30 group">
      <span className={`w-8 shrink-0 font-semibold ${methodColors[rule.method] || 'text-gray-400'}`}>
        {rule.method === '*' ? 'ANY' : rule.method}
      </span>
      <span className="text-gray-600 dark:text-gray-400 truncate flex-1" title={rule.pathPattern}>
        {rule.pathPattern}
      </span>
      <span className="text-gray-400 shrink-0 text-[9px] opacity-0 group-hover:opacity-100">
        :{rule.targetPort}
      </span>
      {methodName && (
        <span className="text-gray-400 shrink-0 text-[9px] opacity-0 group-hover:opacity-100 max-w-[60px] truncate" title={methodName}>
          {methodName}
        </span>
      )}
    </div>
  )
}

function LogRow({ log }: { log: ProxyLogEntry }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono">
      <span className={`w-8 shrink-0 font-semibold ${
        log.matched ? 'text-blue-400' : 'text-gray-500'
      }`}>
        {log.method}
      </span>
      <span className={`truncate flex-1 ${log.matched ? 'text-gray-300' : 'text-gray-500'}`}>
        {log.path}
      </span>
      {log.statusCode && (
        <span className={`shrink-0 ${log.statusCode >= 400 ? 'text-red-400' : 'text-green-400'}`}>
          {log.statusCode}
        </span>
      )}
      {log.duration != null && (
        <span className="text-gray-500 shrink-0">{log.duration}ms</span>
      )}
    </div>
  )
}
