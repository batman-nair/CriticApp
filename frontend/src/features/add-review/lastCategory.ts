import { isSearchCategory } from '../../api/queries/search'
import type { SearchCategory } from '../../api/types'

const STORAGE_KEY = 'critic-add-category'

/** The category last picked in the add sheet, or null if none is stored. */
export function readLastCategory(): SearchCategory | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value !== null && isSearchCategory(value) ? value : null
  } catch {
    return null
  }
}

export function writeLastCategory(category: SearchCategory) {
  try {
    localStorage.setItem(STORAGE_KEY, category)
  } catch {
    // Blocked storage: the next sheet starts on the default category.
  }
}
