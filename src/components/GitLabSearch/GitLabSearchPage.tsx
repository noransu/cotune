import { useEffect } from 'react'
import { useGitLabStore } from '../../stores/gitlab.store'
import GitLabSetup from './GitLabSetup'
import SearchBar from './SearchBar'
import SearchResults from './SearchResults'
import CodePreview from './CodePreview'
import InstanceSelector from './InstanceSelector'

export default function GitLabSearchPage({ onOpenBrowser }: { onOpenBrowser?: (url: string) => void }) {
  const { isLoaded, instances, showSetup, loadInstances, preview } = useGitLabStore()

  useEffect(() => {
    if (!isLoaded) loadInstances()
  }, [isLoaded, loadInstances])

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        Loading...
      </div>
    )
  }

  if (showSetup || instances.length === 0) {
    return <GitLabSetup />
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar: instance selector + search */}
      <div className="shrink-0 border-b border-border dark:border-border-dark bg-panel dark:bg-panel-dark">
        <div className="flex items-center gap-2 px-4 py-2">
          <InstanceSelector />
          <div className="flex-1">
            <SearchBar />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Results list */}
        <div className={`${preview ? 'w-1/2 border-r border-border dark:border-border-dark' : 'w-full'} overflow-hidden flex flex-col transition-all`}>
          <SearchResults onOpenBrowser={onOpenBrowser} />
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="w-1/2 overflow-hidden flex flex-col">
            <CodePreview onOpenBrowser={onOpenBrowser} />
          </div>
        )}
      </div>
    </div>
  )
}
