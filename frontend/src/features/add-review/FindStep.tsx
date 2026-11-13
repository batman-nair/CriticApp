import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { isSearchCategory, useSearch } from '../../api/queries/search'
import type { Category, SearchCategory, SearchResult } from '../../api/types'
import { markSessionExpired } from '../../auth/markSessionExpired'
import { categoryLabel } from '../../lib/categories'
import { Button } from '../../ui/Button/Button'
import { Chip } from '../../ui/Chip/Chip'
import { SearchField } from '../../ui/SearchField/SearchField'
import { Skeleton } from '../../ui/Skeleton/Skeleton'
import styles from './FindStep.module.css'
import { writeLastCategory } from './lastCategory'
import { SearchResultRow } from './SearchResultRow'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue'

/** Below this, a search would match too much to be useful. */
const MIN_QUERY_LENGTH = 3

const SKELETON_CHIPS = 6
const SKELETON_ROWS = 3

interface FindStepProps {
  category: SearchCategory
  /** What's in the search box, as typed. */
  query: string
  onCategoryChange: (category: SearchCategory) => void
  onQueryChange: (query: string) => void
  onSelect: (result: SearchResult) => void
}

/** The add sheet's first step, from boards 03 and 07. */
export function FindStep({
  category,
  query,
  onCategoryChange,
  onQueryChange,
  onSelect,
}: FindStepProps) {
  const queryClient = useQueryClient()
  const categories = useCategories()
  const hintId = useId()

  const draft = query.trim()
  const long = draft.length >= MIN_QUERY_LENGTH
  const q = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS)
  const search = useSearch(
    { category, q },
    { enabled: q.length >= MIN_QUERY_LENGTH },
  )

  const current = categories.data?.find((c) => c.id === category)
  const noun = (current?.label ?? categoryLabel(category)).toLowerCase()
  const label = `Search ${noun}`

  const error = search.error instanceof ApiError ? search.error : null
  const invalid =
    error?.status === 400 && error.code === 'VALIDATION_ERROR' ? error : null
  const unauthenticated =
    error?.status === 401 && error.code === 'UNAUTHENTICATED'

  // The sheet was open when the session ran out: the owner guard then goes to
  // the login page, which comes back to /add.
  useEffect(() => {
    if (unauthenticated) markSessionExpired(queryClient)
  }, [unauthenticated, queryClient])

  let hint: string | null = null
  if (invalid) {
    hint =
      invalid.errors.find((fieldError) => fieldError.field === 'q')?.message ??
      invalid.detail
  } else if (draft.length > 0 && !long) {
    hint = 'Type at least 3 characters.'
  } else if (category === 'movie' || category === 'series') {
    hint = 'You can also paste an IMDb link.'
  }

  // What the status region says, and whether it offers "Try again".
  let message = ''
  let retry = false
  let results = null
  if (long && search.isError) {
    if (invalid || unauthenticated) {
      // Said under the field, or about to leave for the login page.
    } else if (error?.code === 'UPSTREAM_ERROR') {
      message = current
        ? `${current.source} isn’t answering right now.`
        : 'The search isn’t answering right now.'
      retry = true
    } else if (error?.code === 'RATE_LIMITED') {
      message = 'Too many searches. Try again in a moment.'
      retry = true
    } else {
      message = 'Couldn’t search. Check your connection and try again.'
      retry = true
    }
  } else if (long && search.data && search.data.length > 0) {
    results = (
      <ul
        className={styles.results}
        aria-busy={search.isPlaceholderData || undefined}
        data-stale={search.isPlaceholderData || undefined}
      >
        {search.data.map((result) => (
          <SearchResultRow
            key={result.id}
            result={result}
            ratingLabel={current?.rating_label ?? null}
            onSelect={onSelect}
          />
        ))}
      </ul>
    )
  } else if (long && search.data && !search.isPlaceholderData) {
    message = `No ${noun} found for “${q}”. Try another spelling or category.`
  } else if (long) {
    results = <ResultSkeletons />
  }

  return (
    <div className={styles.root}>
      <CategoryChips
        categories={categories}
        selected={category}
        onSelect={(id) => {
          writeLastCategory(id)
          onCategoryChange(id)
        }}
      />
      <SearchField
        tone="sheet"
        label={label}
        placeholder={label}
        value={query}
        onValueChange={onQueryChange}
        enterKeyHint="search"
        autoFocus
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className={invalid ? styles.invalid : styles.hint}>
          {hint}
        </p>
      )}
      {results}
      {/* Always mounted, so a new message is announced. */}
      <div className={message ? styles.notice : undefined}>
        <p role="status">{message}</p>
        {retry && (
          <Button
            variant="secondary"
            size="sm"
            busy={search.isFetching}
            onClick={() => void search.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

interface CategoryChipsProps {
  categories: ReturnType<typeof useCategories>
  selected: SearchCategory
  onSelect: (category: SearchCategory) => void
}

/** One chip per search category, labelled as /categories names them. */
function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  if (categories.data) {
    const searchCategories = categories.data.filter(
      (c): c is Category & { id: SearchCategory } => isSearchCategory(c.id),
    )
    return (
      <div role="group" aria-label="Category" className={styles.chips}>
        {searchCategories.map((c) => (
          <Chip
            key={c.id}
            category={c.id}
            selected={c.id === selected}
            onClick={() => onSelect(c.id)}
          >
            {c.label}
          </Chip>
        ))}
      </div>
    )
  }

  // The search still works, in the category already picked.
  if (categories.isError) {
    return (
      <div className={styles.categoriesError}>
        <span>Couldn’t load the categories.</span>
        <Button
          variant="secondary"
          size="sm"
          busy={categories.isFetching}
          onClick={() => void categories.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.chips}>
      {Array.from({ length: SKELETON_CHIPS }, (_, index) => (
        <Skeleton
          key={index}
          width={88}
          height={40}
          radius={12}
          delay={index * 0.08}
        />
      ))}
    </div>
  )
}

function ResultSkeletons() {
  return (
    <div className={styles.skeletons}>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton width={44} height={66} radius={7} delay={index * 0.1} />
          <div className={styles.skeletonText}>
            <Skeleton width="60%" height={16} radius={4} delay={index * 0.1} />
            <Skeleton width="35%" height={13} radius={4} delay={index * 0.1} />
          </div>
        </div>
      ))}
    </div>
  )
}
