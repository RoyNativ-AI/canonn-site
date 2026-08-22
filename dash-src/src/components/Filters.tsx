import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// One filter treatment for every data screen. Selects were the wrong metaphor:
// a filter is not a form field you fill in, it is a state the screen is in -
// so it is a chip that carries its own value and reads as set or unset at a
// glance. Same control described once, sized by where it lands: a compact
// chip row on a desktop console, full-width option pills in a phone sheet.

export type FilterOption = { id: string; label: string }

export interface FilterSpec {
  /** Dimension name - the mono micro-label inside the chip. */
  label: string
  value: string
  options: readonly FilterOption[]
  onChange: (v: string) => void
  /** The option id that means "not filtering". Defaults to 'all'. */
  allId?: string
}

const isActive = (f: FilterSpec) => f.value !== (f.allId ?? 'all')
const countActive = (filters: FilterSpec[]) => filters.filter(isActive).length
const labelOf = (f: FilterSpec) =>
  f.options.find((o) => o.id === f.value)?.label ?? f.options[0]?.label ?? '—'

/** One dimension, as a chip that opens its options. Active chips carry ink:
 *  a filtered screen should never look like an unfiltered one. */
function FilterChip({ filter }: { filter: FilterSpec }) {
  const [open, setOpen] = useState(false)
  const active = isActive(filter)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-11 max-w-[15rem] min-w-0 items-center gap-2 rounded-lg border px-2.5 transition-colors sm:h-9',
            active
              ? 'border-foreground/25 bg-secondary text-foreground'
              : 'border-input bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="shrink-0 font-mono text-[10px] tracking-[0.11em] text-muted-foreground uppercase">
            {filter.label}
          </span>
          <span className={cn('min-w-0 truncate text-xs', active && 'font-medium')}>{labelOf(filter)}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      {/* The Playground's source menu, reused: a mono eyebrow over a short
          list of quiet rows, the current one ticked. */}
      <PopoverContent align="start" collisionPadding={12} className="w-[min(15rem,calc(100vw-24px))] gap-0 p-1">
        <div className="px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">
          {filter.label}
        </div>
        <div className="max-h-[min(20rem,50vh)] overflow-y-auto">
          {filter.options.map((o) => (
            <button
              key={o.id}
              onClick={() => { filter.onChange(o.id); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-secondary"
            >
              <Check className={cn('size-3.5 shrink-0', o.id === filter.value ? 'opacity-100' : 'opacity-0')} />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The chip row. Clearing is one visible click away, never a hunt through
 *  every dropdown for the option that says "all". */
export function FilterChips({ filters, onClear, className }: {
  filters: FilterSpec[]
  onClear: () => void
  className?: string
}) {
  const active = countActive(filters)
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {filters.map((f) => <FilterChip key={f.label} filter={f} />)}
      {active > 0 && (
        <button
          onClick={onClear}
          className="flex h-11 shrink-0 items-center gap-1 rounded-lg px-2.5 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground sm:h-9"
        >
          <X className="size-3" /> Clear {active}
        </button>
      )}
    </div>
  )
}

/** The phone entry point: one chip carrying every filter, with a count so an
 *  active filter is never invisible behind a closed sheet. */
export function FilterButton({ filters, onClick, className }: {
  filters: FilterSpec[]
  onClick: () => void
  className?: string
}) {
  const active = countActive(filters)
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-mono text-xs transition-colors',
        active > 0
          ? 'border-foreground/25 bg-secondary text-foreground'
          : 'border-input bg-card text-muted-foreground',
        className,
      )}
    >
      <SlidersHorizontal className="size-3.5" />
      Filters
      {active > 0 && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground tabular-nums">
          {active}
        </span>
      )}
    </button>
  )
}

/** The phone sheet. Options are pills, not selects: every choice is visible
 *  and every target is a thumb wide, which is the whole point of the sheet. */
export function FilterSheet({ open, onOpenChange, filters, onClear, doneLabel, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: FilterSpec[]
  onClear: () => void
  /** What the confirm button promises, e.g. "Show 128 requests". */
  doneLabel: string
  /** Screen-specific extras that belong with the filters on a phone. */
  children?: ReactNode
}) {
  const active = countActive(filters)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4">
        <span aria-hidden className="mx-auto -mt-1 mb-3 h-1 w-9 rounded-full bg-border" />
        <SheetHeader className="p-0">
          <SheetTitle className="font-display text-lg">Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          {filters.map((f) => (
            <div key={f.label}>
              <div className="mb-2 font-mono text-[10.5px] tracking-[0.11em] text-muted-foreground uppercase">
                {f.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {f.options.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => f.onChange(o.id)}
                    className={cn(
                      'h-11 max-w-full truncate rounded-lg border px-3.5 text-sm transition-colors',
                      o.id === f.value
                        ? 'border-transparent bg-primary font-medium text-primary-foreground'
                        : 'border-input bg-card text-muted-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {children}
        </div>
        <div className="mt-6 flex gap-2 pb-[max(0px,env(safe-area-inset-bottom))]">
          <Button variant="outline" className="h-11 flex-1" disabled={active === 0} onClick={onClear}>
            Clear all
          </Button>
          <Button className="h-11 flex-1" onClick={() => onOpenChange(false)}>{doneLabel}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
