import { useEffect, useEffectEvent, useState } from 'react'
import type { ReviewFacets } from '../../api/types'
import { categoryLabel, categoryVars } from '../../lib/categories'
import { Chip } from '../../ui/Chip/Chip'
import { SearchField } from '../../ui/SearchField/SearchField'
import { Select } from '../../ui/Select/Select'
import styles from './FilterPanel.module.css'
import {
  FILTER_CATEGORIES,
  SORTS,
  type ReviewFilters,
  type useReviewFilters,
} from './useReviewFilters'

/** How long typing pauses before the search goes into the URL. */
export const SEARCH_DEBOUNCE_MS = 300

const SEARCH_LABEL = 'Search reviews'

const GHOST_PLACEHOLDERS = {
  loading: 'Loading your reviews…',
  unavailable: 'Search is unavailable right now',
}

export interface FilterPanelProps {
  filters: ReviewFilters
  setFilters: ReturnType<typeof useReviewFilters>['setFilters']
  /** Undefined while the counts load or after they failed. */
  facets: ReviewFacets | undefined
  /** The S5/S6 placeholder panel, before the list has loaded once. */
  ghost: 'loading' | 'unavailable' | null
  /** Focus the search box when the live panel mounts. */
  focusSearch?: boolean
}

export function FilterPanel({ ghost, ...props }: FilterPanelProps) {
  return ghost ? <GhostPanel ghost={ghost} /> : <LivePanel {...props} />
}

function GhostPanel({ ghost }: { ghost: 'loading' | 'unavailable' }) {
  return (
    <div className={styles.ghost}>
      <SearchField
        className={styles.ghostSearch}
        label={SEARCH_LABEL}
        placeholder={GHOST_PLACEHOLDERS[ghost]}
        value=""
        onValueChange={() => {}}
        disabled
      />
      <div className={styles.ghostChips} aria-hidden="true">
        {['', ...FILTER_CATEGORIES].map((id) => (
          <span
            key={id}
            className={styles.ghostChip}
            style={id ? categoryVars(id) : undefined}
          >
            <span className={styles.ghostDot} />
            {id ? categoryLabel(id) : 'All'}
          </span>
        ))}
      </div>
    </div>
  )
}

function LivePanel({
  filters,
  setFilters,
  facets,
  focusSearch = false,
}: Omit<FilterPanelProps, 'ghost'>) {
  // What's in the box. It reaches the URL as `q` after a pause in typing.
  const [draft, setDraft] = useState(filters.q)
  // The panel's own write until it lands, so it can't overwrite newer typing.
  const [lastCommitted, setLastCommitted] = useState<string | null>(null)
  const [prevQ, setPrevQ] = useState(filters.q)

  // When `q` changes from outside (Back, "Clear filters", a link), the box
  // follows. Adjusted during render rather than in an effect.
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    if (filters.q === lastCommitted) {
      setLastCommitted(null)
    } else if (filters.q !== draft.trim()) {
      setDraft(filters.q)
    }
  }

  function commitSearch(q: string) {
    if (q === filters.q) return
    setLastCommitted(q)
    setFilters({ q }, { replace: true })
  }

  // Not a dependency: setFilters is a new function on every render.
  const commitLater = useEffectEvent(commitSearch)

  // Keyed on the URL's `q` too, so an outside change cancels a pending write.
  useEffect(() => {
    const q = draft.trim()
    if (q === filters.q) return
    const timer = setTimeout(() => commitLater(q), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, filters.q])

  function changeDraft(value: string) {
    setDraft(value)
    // The clear button, or the last character deleted: no need to wait.
    if (value === '') commitSearch('')
  }

  // Without the counts, the chips still filter.
  const categories =
    facets?.categories ??
    FILTER_CATEGORIES.map((id) => ({ id, count: undefined }))

  return (
    <div className={styles.panel}>
      <SearchField
        label={SEARCH_LABEL}
        placeholder="Search my reviews — a title, a genre, a name, a word I used"
        value={draft}
        onValueChange={changeDraft}
        autoFocus={focusSearch}
      />
      <div className={styles.row}>
        <div role="group" aria-label="Categories" className={styles.chips}>
          <Chip
            count={facets?.total}
            selected={filters.category === ''}
            onClick={() => setFilters({ category: '' })}
          >
            All
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category.id}
              category={category.id}
              count={category.count}
              selected={filters.category === category.id}
              onClick={() => setFilters({ category: category.id })}
            >
              {categoryLabel(category.id)}
            </Chip>
          ))}
        </div>
        <div className={styles.selects}>
          <Select
            label="Language"
            {...languageSelect(filters.language, facets)}
            onValueChange={(language) => setFilters({ language })}
          />
          <Select
            label="Sort"
            value={filters.sort}
            options={[...SORTS]}
            onValueChange={(value) => {
              const sort = SORTS.find((option) => option.value === value)
              if (sort) setFilters({ sort: sort.value })
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The language menu: "Any language" and the facet languages. The API ignores
 * case, so `?language=english` selects "English". A language with no facet
 * is added, so the menu still shows what's applied.
 */
function languageSelect(language: string, facets: ReviewFacets | undefined) {
  const names = facets?.languages.map((facet) => facet.name) ?? []
  const match = names.find(
    (name) => name.toLowerCase() === language.toLowerCase(),
  )
  if (language && !match) names.push(language)
  return {
    value: match ?? language,
    options: [
      { value: '', label: 'Any language' },
      ...names.map((name) => ({ value: name, label: name })),
    ],
  }
}
