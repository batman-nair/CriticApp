import { Link, useParams } from 'react-router'

export function ReviewDetailPage() {
  const { id } = useParams()

  return (
    <section>
      <h2>Review {id}</h2>
      <Link to="/" preventScrollReset>
        Back to the list
      </Link>
    </section>
  )
}
