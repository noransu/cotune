import { useState, useEffect } from 'react'
import { useProxyStore } from '../../stores/proxy.store'

interface BrowserPageProps {
  tabId: string
  url: string
}

export default function BrowserPage({ tabId, url }: BrowserPageProps) {
  const [addressValue, setAddressValue] = useState(url)
  const { logs, isRunning } = useProxyStore()

  useEffect(() => {
    setAddressValue(url)
  }, [url])

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

        {/* Proxy indicator */}
        <div className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] ${
          isRunning
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
          Proxy {isRunning ? 'ON' : 'OFF'}
        </div>

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

      {/* Bottom proxy log bar */}
      <div className="h-7 flex items-center px-3 bg-[#181825] border-t border-[#313244] overflow-hidden">
        {logs.length > 0 ? (
          <div className="flex items-center gap-3 text-[10px] font-mono overflow-x-auto">
            {logs.slice(0, 5).map((log) => (
              <span
                key={log.id}
                className={`whitespace-nowrap ${
                  log.matched
                    ? 'text-blue-400'
                    : 'text-gray-500'
                }`}
              >
                <span className="text-gray-600">{log.method}</span>{' '}
                <span>{log.path}</span>{' '}
                <span className="text-gray-600">→</span>{' '}
                <span>{log.targetHost}:{log.targetPort}</span>{' '}
                {log.statusCode && (
                  <span className={log.statusCode >= 400 ? 'text-red-400' : 'text-green-400'}>
                    {log.statusCode}
                  </span>
                )}
                {log.duration && (
                  <span className="text-gray-600 ml-1">{log.duration}ms</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-gray-500">
            {isRunning ? 'Proxy active — waiting for requests...' : 'Proxy not running'}
          </span>
        )}
      </div>
    </div>
  )
}
