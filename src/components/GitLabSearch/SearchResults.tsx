import { useGitLabStore, SearchScope } from '../../stores/gitlab.store'
import CodeResultItem from './CodeResultItem'
import ProjectResultItem from './ProjectResultItem'
import CommitResultItem from './CommitResultItem'

const scopeLabels: Record<SearchScope, string> = {
  blobs: 'Code',
  projects: 'Projects',
  commits: 'Commits'
}

export default function SearchResults({ onOpenBrowser }: { onOpenBrowser?: (url: string) => void }) {
  const {
    results,
    counts,
    activeScope,
    setActiveScope,
    loading,
    searchError,
    hasMore,
    loadMore,
    query
  } = useGitLabStore()

  const scopes: SearchScope[] = ['blobs', 'projects', 'commits']
  const currentResults = results[activeScope]
  const hasAnyResults = counts.blobs > 0 || counts.projects > 0 || counts.commits > 0
  const hasSearched = query.trim() !== '' && !loading && (hasAnyResults || searchError || currentResults.length === 0)

  return (
    <div className="flex flex-col h-full">
      {/* Scope tabs */}
      {hasAnyResults && (
        <div className="flex items-center gap-0 border-b border-border dark:border-border-dark shrink-0 px-4">
          {scopes.map((scope) => (
            <button
              key={scope}
              onClick={() => setActiveScope(scope)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeScope === scope
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {scopeLabels[scope]}
              {counts[scope] > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeScope === scope
                    ? 'bg-accent/15 text-accent'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}>
                  {counts[scope] > 999 ? '999+' : counts[scope]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Results body */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && currentResults.length === 0 && (
          <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
            <LoadingSpinner />
            <span className="ml-2">Searching...</span>
          </div>
        )}

        {/* Error */}
        {searchError && (
          <div className="m-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
            {searchError}
          </div>
        )}

        {/* Empty state (initial) */}
        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
            <SearchIllustration />
            <p className="mt-4 text-sm">Search across all your GitLab projects</p>
            <p className="mt-1 text-xs">
              Search code, file names, project names, or commit messages
            </p>
          </div>
        )}

        {/* No results */}
        {hasSearched && !hasAnyResults && !searchError && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
            <p className="text-sm">No results found for "{query}"</p>
            <p className="mt-1 text-xs">Try adjusting your search terms or scope</p>
          </div>
        )}

        {/* Results list */}
        {currentResults.length > 0 && (
          <div className="divide-y divide-border dark:divide-border-dark">
            {activeScope === 'blobs' &&
              results.blobs.map((item, i) => (
                <CodeResultItem key={`${item.project_id}-${item.path}-${i}`} item={item} onOpenBrowser={onOpenBrowser} />
              ))}
            {activeScope === 'projects' &&
              results.projects.map((item) => (
                <ProjectResultItem key={item.id} item={item} onOpenBrowser={onOpenBrowser} />
              ))}
            {activeScope === 'commits' &&
              results.commits.map((item) => (
                <CommitResultItem key={item.id} item={item} onOpenBrowser={onOpenBrowser} />
              ))}
          </div>
        )}

        {/* Load more */}
        {hasMore[activeScope] && currentResults.length > 0 && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-4 py-2 text-xs text-accent hover:bg-accent/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  )
}

function SearchIllustration() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-300 dark:text-zinc-600">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M8 11h6M11 8v6" strokeWidth="0.75" />
    </svg>
  )
}
