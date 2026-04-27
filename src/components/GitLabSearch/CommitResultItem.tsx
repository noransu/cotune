import { useCallback } from 'react'
import { useGitLabStore, CommitResult } from '../../stores/gitlab.store'
import HighlightText from './HighlightText'
import CopyButton from './CopyButton'

interface Props {
  item: CommitResult
  onOpenBrowser?: (url: string) => void
}

export default function CommitResultItem({ item, onOpenBrowser }: Props) {
  const query = useGitLabStore((s) => s.query)
  const projectLabel = item._projectName || item._projectPath || `Project #${item.project_id}`

  const getCommitUrl = useCallback(() => item.web_url || '', [item.web_url])

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.web_url && onOpenBrowser) {
      onOpenBrowser(item.web_url)
    }
  }

  const timeAgo = getTimeAgo(item.committed_date || item.authored_date)

  return (
    <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Commit title */}
          <div className="flex items-center gap-2">
            <CommitIcon />
            <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate">
              <HighlightText text={item.title} query={query} />
            </span>
          </div>

          {/* Commit message (if different from title) */}
          {item.message && item.message !== item.title && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 ml-[22px] whitespace-pre-line">
              <HighlightText text={item.message.slice(item.title.length).trim()} query={query} />
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1.5 ml-[22px]">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
              {item.short_id}
            </span>
            <span className="text-[10px] text-zinc-400">{projectLabel}</span>
            <span className="text-[10px] text-zinc-400">
              by {item.author_name}
            </span>
            <span className="text-[10px] text-zinc-400">{timeAgo}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          <CopyButton getText={getCommitUrl} tooltip="Copy commit link" />
          {onOpenBrowser && item.web_url && (
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

function CommitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
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
