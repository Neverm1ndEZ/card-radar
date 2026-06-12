'use client'

import { CATEGORY_ICONS, CATEGORY_LABELS, type SpendCategory } from '@/lib/validators'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  category: SpendCategory
  value: number
  onChange: (val: number) => void
}

export function CategoryInput({ category, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300">
      <span className="text-xl">{CATEGORY_ICONS[category]}</span>
      <Label className="flex-1 cursor-pointer text-sm font-medium text-zinc-700">
        {CATEGORY_LABELS[category]}
      </Label>
      <div className="relative flex items-center">
        <span className="absolute left-3 text-sm text-zinc-400">₹</span>
        <Input
          type="number"
          min={0}
          step={500}
          value={value || ''}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          className="w-32 pl-7 text-right text-sm"
        />
      </div>
    </div>
  )
}
