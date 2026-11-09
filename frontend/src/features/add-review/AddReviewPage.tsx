import { Link } from 'react-router'

export function AddReviewPage() {
  return (
    <section>
      <h2>Add review</h2>
      <Link to="/" preventScrollReset>
        Back to the list
      </Link>
    </section>
  )
}
