'use client'

interface Props {
  current: number
  total: number
  labels: string[]
}

export function QuizProgress({ current, total, labels }: Props) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Step {current + 1} of {total}
        </span>
        <span className="text-xs text-zinc-400">{labels[current]}</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= current ? 'bg-zinc-900' : 'bg-zinc-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
