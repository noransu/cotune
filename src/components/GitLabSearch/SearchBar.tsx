import { useState, useCallback, useEffect } from 'react'
import { useGitLabStore, SearchScope } from '../../stores/gitlab.store'

export default function SearchBar() {
  const {
    query,
    setQuery,
    searchAllScopes,
    searchLevel,
    setSearchLevel,
    selectedGroupId,
    setSelectedGroup,
    groups,
    groupsLoading,
    loading
  } = useGitLabStore()

  const [localQuery, setLocalQuery] = useState(query)

  // Sync local query with store when cleared externally
  useEffect(() => {
    if (query === '' && localQuery !== '') setLocalQuery('')
  }, [query])

  const handleSearch = useCallback(() => {
    if (!localQuery.trim()) return
    setQuery(localQuery.trim())
    // Defer to next tick so store query is updated
    setTimeout(() => {
      useGitLabStore.getState().searchAllScopes()
    }, 0)
  }, [localQuery, setQuery])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search input row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search code, files, projects, commits..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Search level toggle */}
        <div className="flex items-center rounded-lg border border-border dark:border-border-dark overflow-hidden shrink-0">
          <button
            onClick={() => setSearchLevel('global')}
            className={`px-2.5 py-2 text-xs transition-colors ${
              searchLevel === 'global'
                ? 'bg-accent text-white'
                : 'text-zinc-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setSearchLevel('group')}
            className={`px-2.5 py-2 text-xs transition-colors ${
              searchLevel === 'group'
                ? 'bg-accent text-white'
                : 'text-zinc-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Group
          </button>
        </div>

        {/* Group selector (shown when level is group) */}
        {searchLevel === 'group' && (
          <select
            value={selectedGroupId ?? ''}
            onChange={(e) => setSelectedGroup(e.target.value ? Number(e.target.value) : null)}
            disabled={groupsLoading}
            className="px-2.5 py-2 text-xs rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-accent max-w-[180px]"
          >
            <option value="">
              {groupsLoading ? 'Loading groups...' : 'Select Group'}
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.full_path}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={handleSearch}
          disabled={loading || !localQuery.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}
