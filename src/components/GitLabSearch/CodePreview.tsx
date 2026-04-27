import { useEffect, useRef, useCallback } from 'react'
import { useGitLabStore } from '../../stores/gitlab.store'
import { HighlightCode } from './HighlightText'
import CopyButton from './CopyButton'

export default function CodePreview({ onOpenBrowser }: { onOpenBrowser?: (url: string) => void }) {
  const { preview, previewLoading, closePreview, query } = useGitLabStore()
  const highlightRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the matched line
  useEffect(() => {
    if (!preview || !highlightRef.current) return
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => clearTimeout(timer)
  }, [preview])

  const getFileUrl = useCallback(async () => {
    if (!preview || !window.api) return ''
    return await window.api.gitlabBuildWebUrl({
      instanceId: preview.instanceId,
      projectPath: preview.projectPath,
      filePath: preview.filePath,
      ref: preview.ref,
      line: preview.startLine
    })
  }, [preview])

  const handleOpenInBrowser = async () => {
    if (!onOpenBrowser) return
    const url = await getFileUrl()
    if (url) onOpenBrowser(url)
  }

  if (previewLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
        <LoadingSpinner />
        <span className="ml-2">Loading file...</span>
      </div>
    )
  }

  if (!preview) return null

  const lines = preview.content.split('\n')
  const ext = preview.filePath.split('.').pop() || ''

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border dark:border-border-dark bg-panel dark:bg-panel-dark shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileIcon />
          <span className="text-xs text-zinc-500 truncate">{preview.projectPath}</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {preview.filePath}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
            {preview.ref}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <CopyButton getText={getFileUrl} tooltip="Copy file link" />
          {onOpenBrowser && (
            <button
              onClick={handleOpenInBrowser}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Open in browser tab"
            >
              <ExternalIcon />
            </button>
          )}
          <button
            onClick={closePreview}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            title="Close preview"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-[#1a1a2e]">
        <pre className="text-[11px] leading-5 min-w-fit">
          {lines.map((line, i) => {
            const lineNum = i + 1
            const isHighlighted = lineNum >= preview.startLine && lineNum < preview.startLine + 10
            return (
              <div
                key={i}
                ref={lineNum === preview.startLine ? highlightRef : undefined}
                className={`flex ${isHighlighted ? 'bg-accent/10' : 'hover:bg-gray-100 dark:hover:bg-gray-800/30'}`}
              >
                <span className={`w-12 shrink-0 text-right pr-3 select-none border-r ${
                  isHighlighted
                    ? 'text-accent font-medium border-accent/30 bg-accent/5'
                    : 'text-zinc-400 border-border dark:border-border-dark'
                }`}>
                  {lineNum}
                </span>
                <code className="px-4 text-zinc-700 dark:text-zinc-300 whitespace-pre">
                  <HighlightCode text={line} query={query} />
                </code>
              </div>
            )
          })}
        </pre>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-1.5 border-t border-border dark:border-border-dark bg-panel dark:bg-panel-dark">
        <span className="text-[10px] text-zinc-400">
          {lines.length} lines | {ext.toUpperCase()} | Line {preview.startLine}
        </span>
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

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
