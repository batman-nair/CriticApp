import type { SearchResult } from '../../api/types'

interface RatePlaceholderProps {
  item: SearchResult
}

/** Stands in for the Rate step, which #92 builds. */
export function RatePlaceholder({ item }: RatePlaceholderProps) {
  return (
    <p>
      Rating comes next for <strong>{item.title}</strong>.
    </p>
  )
}
