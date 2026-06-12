import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="mt-auto rule-b border-t-[1.5px] border-t-[var(--rule)] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-[var(--ink-faint)] sm:flex-row">
        <div className="flex items-center gap-4">
          <Link href="/find-my-card" className="transition-colors hover:text-[var(--ink)]">find my card</Link>
          <Link href="/cards" className="transition-colors hover:text-[var(--ink)]">browse</Link>
        </div>
        <div>independent · affiliate links disclosed and never bias rankings.</div>
      </div>
    </footer>
  )
}
