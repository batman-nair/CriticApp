import { Link, useLocation, useOutletContext, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import { useCategories } from '../../api/queries/categories'
import { useItem } from '../../api/queries/items'
import { reviewCategory } from '../../lib/categories'
import type { WatchlistOutlet } from '../../lib/watchlistOutlet'
import { buttonClass } from '../../ui/Button/buttonClass'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { Icon } from '../../ui/Icon/Icon'
import { WatchlistDetail } from './WatchlistDetail'
import { WatchlistDetailStatus } from './WatchlistDetailStatus'

/**
 * A watchlist title's details (`/watchlist/items/:itemId`), over the page.
 * A loaded card's entry shows at once; a direct link or a reload whose list
 * doesn't have it fetches the stored item instead, which has no added date.
 */
export function WatchlistDetailPage() {
  const itemId = useParams().itemId ?? ''
  const dialog = useRouteDialog()
  const location = useLocation()
  const outlet = useOutletContext<WatchlistOutlet | undefined>()
  const entry = outlet?.entries.find((e) => e.item.id === itemId)
  // Not while the page's list first loads: on a reload the entry is usually
  // on it, with the date it was added.
  const fetched = useItem(itemId, {
    enabled: itemId !== '' && !entry && !outlet?.entriesPending,
  })
  const categories = useCategories()

  const notFound =
    fetched.error instanceof ApiError && fetched.error.status === 404
  // A 404 wins over a cached copy, so a title deleted elsewhere goes.
  const item = entry?.item ?? (notFound ? undefined : fetched.data)

  let title
  let category
  let body
  if (item) {
    title = item.title
    // As WatchlistDetail tints itself, so the dialog matches.
    category =
      item.category === 'anime'
        ? reviewCategory(item.category, item.details.media_type)
        : item.category
    // Undefined while /categories loads, null when it doesn't know.
    const ratingLabel = categories.isPending
      ? undefined
      : (categories.data?.find((c) => c.id === item.category)?.rating_label ??
        null)
    body = (
      <WatchlistDetail
        item={item}
        addedAt={entry?.added_at}
        ratingLabel={ratingLabel}
        actions={
          // In this dialog's place, so closing the review goes where closing
          // this would have: Back to the watchlist, or up to it.
          <Link
            to={{
              pathname: `/watchlist/review/${encodeURIComponent(item.id)}`,
              search: location.search,
            }}
            state={location.state}
            replace
            preventScrollReset
            className={buttonClass({ variant: 'primary', size: 'lg' })}
          >
            <Icon name="star-outline" size={16} />
            Review it
          </Link>
        }
      />
    )
  } else if (notFound) {
    title = 'Title not found'
    body = (
      <WatchlistDetailStatus
        kind="not-found"
        onAction={() => dialog.onOpenChange(false)}
      />
    )
  } else if (fetched.isError && !fetched.isFetching) {
    title = 'Watchlist'
    body = (
      <WatchlistDetailStatus
        kind="error"
        onAction={() => void fetched.refetch()}
      />
    )
  } else {
    title = 'Watchlist'
    body = <WatchlistDetailStatus kind="loading" />
  }

  return (
    <Dialog
      {...dialog}
      size="detail"
      hideTitle
      title={title}
      category={category}
      bodyKey={itemId}
    >
      {body}
    </Dialog>
  )
}
