import React from 'react'

/**
 * Splits text by the query keyword and wraps matches in a highlighted span.
 * Case-insensitive matching. Returns original text if query is empty.
 */
export default function HighlightText({
  text,
  query,
  className = ''
}: {
  text: string
  query: string
  className?: string
}) {
  if (!query.trim() || !text) {
    return <>{text}</>
  }

  // Escape regex special chars in query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className={`bg-yellow-200 dark:bg-yellow-500/30 text-inherit rounded-sm px-[1px] ${className}`}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}

/**
 * Same logic but for use inside <code> blocks — returns spans instead of marks
 * to avoid breaking monospace layout.
 */
export function HighlightCode({
  text,
  query,
}: {
  text: string
  query: string
}) {
  if (!query.trim() || !text) {
    return <>{text}</>
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span
            key={i}
            className="bg-yellow-200 dark:bg-yellow-500/30 rounded-sm"
          >
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}
