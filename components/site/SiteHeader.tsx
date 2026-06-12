import Link from 'next/link'

export function RadarLogo({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="8" />
      <circle cx="16" cy="16" r="3" />
      <path d="M16 16 L26 8" />
      <circle cx="22" cy="11" r="1.6" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <RadarLogo size={22} color="var(--ink)" />
      <span className="hand text-[19px] font-bold text-[var(--ink)]">CardRadar</span>
    </Link>
  );
}

type NavKey = 'home' | 'find' | 'cards' | 'radar' | 'compare' | 'ask'

const NAV: { key: NavKey; label: string; href?: string }[] = [
  { key: 'find', label: 'find my card', href: '/find-my-card' },
  { key: 'cards', label: 'browse', href: '/cards' },
  { key: 'radar', label: 'radar' },
  { key: 'compare', label: 'compare' },
  { key: 'ask', label: 'ask' },
]

export function SiteHeader({ active, rightSlot }: { active?: NavKey; rightSlot?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 rule-b bg-[var(--paper)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-5">
        <BrandMark />
        <nav className="hidden items-center gap-5 sm:flex">
          {NAV.map((item) =>
            item.href ? (
              <Link
                key={item.key}
                href={item.href}
                className={`text-[15px] underline-offset-4 transition-colors ${
                  active === item.key ? 'text-[var(--ink)] underline' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span key={item.key} className="text-[15px] text-[var(--ink-faint)]" title="coming soon">
                {item.label}
              </span>
            )
          )}
        </nav>
        <span className="flex-1" />
        {rightSlot ?? (
          <span className="mono wf-pill hidden text-[11px] sm:inline-flex">⌘K</span>
        )}
      </div>
    </header>
  );
}
