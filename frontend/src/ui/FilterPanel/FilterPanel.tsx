import { useEffect, useEffectEvent, useState } from 'react'
import {
  categoryLabel,
  categoryVars,
  FILTER_CATEGORIES,
} from '../../lib/categories'
import { Chip } from '../Chip/Chip'
import { SearchField } from '../SearchField/SearchField'
import { Select } from '../Select/Select'
import styles from './FilterPanel.module.css'

/** How long typing pauses before the search goes into the URL. */
export const SEARCH_DEBOUNCE_MS = 300

/** `''` is "All" for the category and "any" for the language. */
export interface FilterValues<S extends string> {
  q: string
  category: string
  language: string
  sort: S
}

/** The counts behind the chips and the language menu. */
export interface FilterFacets {
  total: number
  categories: { id: string; count: number }[]
  languages: { name: string; count: number }[]
}

type Ghost = 'loading' | 'unavailable'

export interface FilterPanelProps<S extends string> {
  filters: FilterValues<S>
  setFilters: (
    patch: Partial<FilterValues<S>>,
    options?: { replace?: boolean },
  ) => void
  /** Undefined while the counts load or after they failed. */
  facets?: FilterFacets
  /** The S5/S6 placeholder panel, before the list has loaded once. */
  ghost: Ghost | null
  /** Focus the search box when the live panel mounts. */
  focusSearch?: boolean
  /** The search box's accessible name. */
  searchLabel: string
  searchPlaceholder: string
  /** The disabled search box's placeholder for each ghost. */
  ghostPlaceholders: Record<Ghost, string>
  /** The sort menu's options, the default first. */
  sorts: readonly { value: S; label: string }[]
}

export function FilterPanel<S extends string>({
  ghost,
  ...props
}: FilterPanelProps<S>) {
  return ghost ? (
    <GhostPanel
      ghost={ghost}
      searchLabel={props.searchLabel}
      ghostPlaceholders={props.ghostPlaceholders}
    />
  ) : (
    <LivePanel {...props} />
  )
}

function GhostPanel({
  ghost,
  searchLabel,
  ghostPlaceholders,
}: { ghost: Ghost } & Pick<
  FilterPanelProps<string>,
  'searchLabel' | 'ghostPlaceholders'
>) {
  return (
    <div className={styles.ghost}>
      <SearchField
        className={styles.ghostSearch}
        label={searchLabel}
        placeholder={ghostPlaceholders[ghost]}
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

function LivePanel<S extends string>({
  filters,
  setFilters,
  facets,
  focusSearch = false,
  searchLabel,
  searchPlaceholder,
  sorts,
}: Omit<FilterPanelProps<S>, 'ghost' | 'ghostPlaceholders'>) {
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
        label={searchLabel}
        placeholder={searchPlaceholder}
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
            options={[...sorts]}
            onValueChange={(value) => {
              const sort = sorts.find((option) => option.value === value)
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
function languageSelect(language: string, facets: FilterFacets | undefined) {
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
