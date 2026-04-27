import { useState, useCallback } from 'react'

interface CopyButtonProps {
  getText: () => Promise<string> | string
  tooltip: string
  className?: string
}

/**
 * A copy button that uses Electron's clipboard API.
 * Shows a checkmark + "Copied!" feedback for 2 seconds after copying.
 */
export default function CopyButton({ getText, tooltip, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const text = await getText()
      if (text && window.api?.clipboardWrite) {
        await window.api.clipboardWrite(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* ignore */ }
  }, [getText])

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 p-1 rounded transition-colors ${
        copied
          ? 'text-green-500 dark:text-green-400'
          : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
      } ${className}`}
      title={copied ? 'Copied!' : tooltip}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied && (
        <span className="text-[10px] font-medium whitespace-nowrap">
          Copied!
        </span>
      )}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
