import { useCallback } from 'react'
import { useGitLabStore, ProjectResult } from '../../stores/gitlab.store'
import HighlightText from './HighlightText'
import CopyButton from './CopyButton'

interface Props {
  item: ProjectResult
  onOpenBrowser?: (url: string) => void
}

export default function ProjectResultItem({ item, onOpenBrowser }: Props) {
  const query = useGitLabStore((s) => s.query)

  const getProjectUrl = useCallback(() => item.web_url, [item.web_url])

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenBrowser?.(item.web_url)
  }

  const timeAgo = getTimeAgo(item.last_activity_at)

  return (
    <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Project name */}
          <div className="flex items-center gap-2">
            <RepoIcon />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
              <HighlightText text={item.path_with_namespace} query={query} />
            </span>
          </div>

          {/* Description */}
          {item.description && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 ml-[22px]">
              <HighlightText text={item.description} query={query} />
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1.5 ml-[22px]">
            <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
              <StarIcon /> {item.star_count}
            </span>
            <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
              <ForkIcon /> {item.forks_count}
            </span>
            {item.default_branch && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                {item.default_branch}
              </span>
            )}
            <span className="text-[10px] text-zinc-400">
              Updated {timeAgo}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          <CopyButton getText={getProjectUrl} tooltip="Copy project link" />
          {onOpenBrowser && (
            <button
              onClick={handleOpenInBrowser}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Open in browser tab"
            >
              <ExternalIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${Math.floor(diffMonth / 12)}y ago`
}

function RepoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v1a2 2 0 01-2 2H8a2 2 0 01-2-2V9M12 12v3" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  )
}
