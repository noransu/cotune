import { useCallback } from 'react'
import { useGitLabStore, BlobResult } from '../../stores/gitlab.store'
import { HighlightCode } from './HighlightText'
import CopyButton from './CopyButton'

interface Props {
  item: BlobResult
  onOpenBrowser?: (url: string) => void
}

export default function CodeResultItem({ item, onOpenBrowser }: Props) {
  const { activeInstanceId, openPreview, query } = useGitLabStore()

  const projectLabel = item._projectName || item._projectPath || `Project #${item.project_id}`
  const projectPath = item._projectPath || ''

  const handleClick = () => {
    if (!activeInstanceId) return
    openPreview({
      instanceId: activeInstanceId,
      projectId: item.project_id,
      filePath: item.path,
      ref: item.ref || 'main',
      startLine: item.startline,
      projectPath
    })
  }

  const getFileUrl = useCallback(async () => {
    if (!activeInstanceId || !window.api) return ''
    return await window.api.gitlabBuildWebUrl({
      instanceId: activeInstanceId,
      projectPath,
      filePath: item.path,
      ref: item.ref || 'main',
      line: item.startline
    })
  }, [activeInstanceId, projectPath, item.path, item.ref, item.startline])

  const handleOpenInBrowser = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onOpenBrowser) return
    const url = await getFileUrl()
    if (url) onOpenBrowser(url)
  }

  const codeLines = (item.data || '').split('\n')

  return (
    <div
      onClick={handleClick}
      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group"
    >
      {/* File path header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FileIcon />
          <span className="text-xs text-zinc-400 truncate">{projectLabel}</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-xs font-medium text-accent truncate">{item.path}</span>
          {item.ref && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
              {item.ref}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          <CopyButton getText={getFileUrl} tooltip="Copy file link" />
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

      {/* Code snippet */}
      <div className="rounded-md overflow-hidden border border-border dark:border-border-dark bg-zinc-50 dark:bg-[#1a1a2e]">
        <div className="overflow-x-auto">
          <pre className="text-[11px] leading-5">
            {codeLines.slice(0, 8).map((line, i) => {
              const lineNum = item.startline + i
              return (
                <div
                  key={i}
                  className="flex hover:bg-accent/5"
                >
                  <span className="w-10 shrink-0 text-right pr-2 text-zinc-400 select-none border-r border-border dark:border-border-dark bg-zinc-100/50 dark:bg-zinc-900/50">
                    {lineNum}
                  </span>
                  <code className="px-3 text-zinc-700 dark:text-zinc-300 whitespace-pre">
                    <HighlightCode text={line} query={query} />
                  </code>
                </div>
              )
            })}
          </pre>
        </div>
      </div>
    </div>
  )
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
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
