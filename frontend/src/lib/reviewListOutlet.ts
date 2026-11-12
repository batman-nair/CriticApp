import type { Review } from '../api/types'

/**
 * What the review list hands its child routes through `<Outlet context>`.
 * It lives here because the list and the detail features don't import each
 * other.
 */
export interface ReviewListOutlet {
  /** The loaded reviews, de-duplicated, in the order the list shows them. */
  reviews: Review[]
  hasNextPage: boolean
  /** Asks for the next page, unless one is already on its way. */
  loadMore: () => Promise<unknown>
  isLoadingMore: boolean
}
