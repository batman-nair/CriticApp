import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import type { Review } from '../../api/types'
import { expectNoAxeViolations } from '../../test/axe'
import { makeReview } from '../../test/fixtures'
import { renderWithClient } from '../../test/render'
import { ReviewEditForm } from './ReviewEditForm'
import type { Draft, DraftErrors } from './useReviewEditor'

interface SetupOptions {
  review?: Review
  ratingLabel?: string | null | undefined
  errors?: DraftErrors
  formError?: string | null
}

// `ratingLabel: undefined` is a case of its own, so not a parameter default.
function setup(options: SetupOptions = {}) {
  const {
    review = makeReview({ tags: ['cozy'] }),
    errors = {},
    formError = null,
  } = options
  const ratingLabel =
    'ratingLabel' in options ? options.ratingLabel : 'MyAnimeList'
  const onChange = vi.fn()
  const onSubmit = vi.fn()

  function Harness() {
    const [draft, setDraft] = useState<Draft>({
      rating: review.rating,
      text: review.text ?? '',
      tags: review.tags,
    })
    return (
      <ReviewEditForm
        id="edit-review"
        review={review}
        ratingLabel={ratingLabel}
        draft={draft}
        errors={errors}
        formError={formError}
        onChange={(update) => {
          onChange(update)
          setDraft((current) => ({ ...current, ...update }))
        }}
        onSubmit={onSubmit}
      />
    )
  }

  const view = renderWithClient(<Harness />)
  return { ...view, onChange, onSubmit, user: userEvent.setup() }
}

const slider = () => screen.getByRole('slider', { name: 'My rating' })
const notes = () => screen.getByRole('textbox', { name: 'In a line or two' })
const tagsField = () => screen.getByRole('textbox', { name: /^Tags/ })

it('shows the review’s rating, notes and tags', () => {
  setup()

  expect(slider()).toHaveAttribute('aria-valuenow', '9.5')
  expect(notes()).toHaveValue('Still the coolest thing ever animated.')
  expect(tagsField()).toHaveValue('cozy')
  expect(screen.getByText('(optional)')).toBeInTheDocument()
})

it('starts on the rating', () => {
  setup()

  expect(slider()).toHaveFocus()
})

it('shows the provider’s rating beside the ruler', () => {
  setup()

  const group = screen.getByRole('group', { name: 'My rating' })
  expect(within(group).getByText('MyAnimeList 8.8')).toBeInTheDocument()
})

it('calls the provider’s rating "Rating" when its name isn’t known', () => {
  setup({ ratingLabel: null })

  expect(screen.getByText('Rating 8.8')).toBeInTheDocument()
})

it('leaves the provider’s rating out while its name loads', () => {
  setup({ ratingLabel: undefined })

  expect(screen.queryByText(/8\.8/)).not.toBeInTheDocument()
})

it('counts the notes against 5000', async () => {
  const { user } = setup({ review: makeReview({ text: null }) })

  expect(screen.getByText('0 / 5000')).toBeInTheDocument()
  await user.type(notes(), 'Great')
  expect(screen.getByText('5 / 5000')).toBeInTheDocument()
})

it('suggests the most-used tags not already given', async () => {
  const { user, onChange } = setup({
    review: makeReview({ tags: ['comfort'] }),
  })

  await user.click(await screen.findByRole('button', { name: '+ rewatch' }))

  expect(onChange).toHaveBeenLastCalledWith({ tags: ['comfort', 'rewatch'] })
  expect(
    screen.getByRole('button', { name: '+ soundtrack' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '+ comfort' }),
  ).not.toBeInTheDocument()
})

it('sends each change up', async () => {
  const { user, onChange } = setup()

  await user.keyboard('{ArrowRight}')
  expect(onChange).toHaveBeenLastCalledWith({ rating: 9.6 })

  await user.clear(notes())
  await user.type(notes(), 'Ok')
  expect(onChange).toHaveBeenLastCalledWith({ text: 'Ok' })

  await user.type(tagsField(), ', jazz')
  expect(onChange).toHaveBeenLastCalledWith({ tags: ['cozy', 'jazz'] })
})

it('submits on Enter in the tags', async () => {
  const { user, onSubmit } = setup()

  await user.type(tagsField(), '{Enter}')

  expect(onSubmit).toHaveBeenCalledOnce()
})

it('shows the server’s messages under their fields', () => {
  setup({
    errors: { rating: 'At most 10.', text: 'Too long.', tags: 'Letters only.' },
  })

  expect(
    screen.getByRole('group', { name: 'My rating' }),
  ).toHaveAccessibleDescription('At most 10.')
  expect(notes()).toHaveAccessibleDescription(
    expect.stringContaining('Too long.'),
  )
  expect(tagsField()).toHaveAccessibleDescription('Letters only.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a message for the whole form', () => {
  setup({ formError: 'Couldn’t save. Try again.' })

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t save. Try again.',
  )
})

it('has no axe violations', async () => {
  const { container } = setup({
    errors: { rating: 'At most 10.', text: 'Too long.' },
    formError: 'Couldn’t save. Try again.',
  })
  await screen.findByRole('button', { name: '+ rewatch' })

  await expectNoAxeViolations(container)
}, 30_000)
