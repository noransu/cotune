import { useEffect, useState } from 'react'
import { useThemeStore } from '../../stores/theme.store'
import type { Tab } from '../../App'

interface TitleBarProps {
  tabs: Tab[]
  activeTabId: string
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
  onNewTab: () => void
}

export default function TitleBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab
}: TitleBarProps) {
  const { mode, toggle } = useThemeStore()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.api) return
    window.api.windowIsMaximized().then(setIsMaximized)
    const dispose = window.api.onMaximizedChanged(setIsMaximized)
    return dispose
  }, [])

  return (
    <div className="h-10 flex items-center bg-panel dark:bg-panel-dark border-b border-border dark:border-border-dark select-none app-drag">
      {/* Tabs */}
      <div className="flex items-center h-full pl-2 flex-1 app-no-drag overflow-x-auto">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onTabSelect(tab.id)}
            onClose={() => onTabClose(tab.id)}
          />
        ))}
        <button
          onClick={onNewTab}
          className="ml-1 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm"
          title="New browser tab"
        >
          +
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 px-2 app-no-drag">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' ? (
            <SunIcon />
          ) : (
            <MoonIcon />
          )}
        </button>

        {/* Window controls */}
        <button
          onClick={() => window.api?.windowMinimize()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          onClick={() => window.api?.windowMaximize()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          onClick={() => window.api?.windowClose()}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500 hover:text-white"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

function TabItem({
  tab,
  isActive,
  onSelect,
  onClose
}: {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        group flex items-center gap-1.5 h-8 px-3 rounded-t text-xs cursor-pointer
        transition-colors duration-150
        ${
          isActive
            ? 'bg-surface dark:bg-surface-dark text-gray-900 dark:text-gray-100 border-t-2 border-accent'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}
    >
      <span className="mr-0.5">
        {tab.type === 'home' ? (
          <HomeIcon />
        ) : (
          <GlobeIcon />
        )}
      </span>
      <span className="max-w-[100px] truncate">{tab.title}</span>
      {tab.type !== 'home' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-600 text-[10px]"
        >
          x
        </button>
      )}
    </div>
  )
}

// --- SVG Icons ---

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="5.5" width="8" height="1" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="2" y="2" width="8" height="8" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="3" y="3" width="6" height="6" />
      <path d="M4.5 3V1.5H10.5V7.5H9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M2.5 1.5L10.5 10.5M10.5 1.5L2.5 10.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
