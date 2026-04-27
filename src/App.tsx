import { useCallback, useEffect, useState } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import MenuBar from './components/MenuBar/MenuBar'
import HomePage from './components/HomePage/HomePage'
import DebugPage from './components/DebugPage/DebugPage'
import BrowserPage from './components/BrowserView/BrowserPage'
import GitLabSearchPage from './components/GitLabSearch/GitLabSearchPage'

export interface Tab {
  id: string
  type: 'home' | 'browser'
  title: string
  url?: string
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'home', type: 'home', title: 'Home' }
  ])
  const [activeTabId, setActiveTabId] = useState('home')
  const [currentView, setCurrentView] = useState<'home' | 'debug' | 'gitlab'>('home')

  // Listen for browser title/url updates
  useEffect(() => {
    if (!window.api) return
    const disposeTitleListener = window.api.onBrowserTitleUpdated(({ id, title }: { id: string; title: string }) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title } : t))
      )
    })
    const disposeUrlListener = window.api.onBrowserUrlUpdated(({ id, url }: { id: string; url: string }) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, url } : t))
      )
    })
    return () => {
      disposeTitleListener()
      disposeUrlListener()
    }
  }, [])

  // Handle tab switching - show/hide browser views
  useEffect(() => {
    if (!window.api) return
    if (activeTabId === 'home') {
      window.api.browserHideAll()
    } else {
      window.api.browserShowTab({ id: activeTabId })
    }
  }, [activeTabId])

  const addBrowserTab = async () => {
    if (!window.api) return
    const id = `browser-${Date.now()}`
    const newTab: Tab = { id, type: 'browser', title: 'New Tab', url: '' }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    await window.api.browserCreateTab({ id })
  }

  // Open browser tab with a specific URL (used by Debug page Start All)
  const openBrowserWithUrl = useCallback(async (url: string) => {
    if (!window.api) return
    const id = `browser-${Date.now()}`
    const newTab: Tab = { id, type: 'browser', title: 'Loading...', url }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    await window.api.browserCreateTab({ id, url })
  }, [])

  const closeTab = async (tabId: string) => {
    if (tabId === 'home') return
    setTabs((prev) => prev.filter((t) => t.id !== tabId))
    if (window.api) {
      await window.api.browserCloseTab({ id: tabId })
    }
    if (activeTabId === tabId) {
      setActiveTabId('home')
    }
  }

  // Switching menu view also ensures we're on the home tab
  const handleViewChange = useCallback((view: 'home' | 'debug' | 'gitlab') => {
    setCurrentView(view)
    setActiveTabId('home')
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="h-screen w-screen flex flex-col bg-surface dark:bg-surface-dark">
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        onNewTab={addBrowserTab}
      />
      <main className="flex-1 overflow-hidden flex">
        <MenuBar currentView={currentView} onViewChange={handleViewChange} />
        <div className="flex-1 overflow-hidden">
          {/* HomePage is always mounted to preserve terminal state; hidden when inactive */}
          <div className={`h-full ${activeTabId !== 'home' || currentView !== 'home' ? 'hidden' : ''}`}>
            <HomePage />
          </div>
          {/* DebugPage is always mounted to preserve process state; hidden when inactive */}
          <div className={`h-full ${activeTabId !== 'home' || currentView !== 'debug' ? 'hidden' : ''}`}>
            <DebugPage onOpenBrowser={openBrowserWithUrl} />
          </div>
          {/* GitLab Search */}
          <div className={`h-full ${activeTabId !== 'home' || currentView !== 'gitlab' ? 'hidden' : ''}`}>
            <GitLabSearchPage onOpenBrowser={openBrowserWithUrl} />
          </div>
          {activeTab && activeTab.type === 'browser' && (
            <BrowserPage
              tabId={activeTabId}
              url={activeTab?.url || ''}
            />
          )}
        </div>
      </main>
    </div>
  )
}
