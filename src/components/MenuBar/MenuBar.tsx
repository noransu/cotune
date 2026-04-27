interface MenuBarProps {
  currentView: 'home' | 'debug' | 'gitlab'
  onViewChange: (view: 'home' | 'debug' | 'gitlab') => void
}

export default function MenuBar({ currentView, onViewChange }: MenuBarProps) {
  return (
    <div className="w-12 h-full flex flex-col items-center pt-2 gap-1 bg-panel dark:bg-panel-dark border-r border-border dark:border-border-dark shrink-0">
      <MenuItem
        icon={<HomeIcon />}
        label="Home"
        active={currentView === 'home'}
        onClick={() => onViewChange('home')}
      />
      <MenuItem
        icon={<DebugIcon />}
        label="Debug"
        active={currentView === 'debug'}
        onClick={() => onViewChange('debug')}
      />
      <MenuItem
        icon={<GitLabIcon />}
        label="GitLab Search"
        active={currentView === 'gitlab'}
        onClick={() => onViewChange('gitlab')}
      />
    </div>
  )
}

function MenuItem({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-zinc-400 hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
      )}
      {icon}
    </button>
  )
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}

function DebugIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Git-branch / tree style icon */}
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M6 6a9 9 0 0 0 9 0" />
    </svg>
  )
}

function GitLabIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  )
}
