interface MenuBarProps {
  currentView: 'home' | 'debug'
  onViewChange: (view: 'home' | 'debug') => void
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
      {/* Pipeline / connection icon: two nodes connected by a line */}
      <circle cx="5" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      <line x1="8" y1="12" x2="16" y2="12" />
      {/* Small arrows on the line to indicate data flow */}
      <polyline points="13,9.5 16,12 13,14.5" />
    </svg>
  )
}
