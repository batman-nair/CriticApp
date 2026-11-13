import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../test/axe'
import { makeSearchResult } from '../../test/fixtures'
import { renderWithClient } from '../../test/render'
import { RateStep } from './RateStep'
import type { AddFlow, AddFlowErrors } from './useAddFlow'

interface SetupOptions {
  mode?: AddFlow['mode']
  prefill?: AddFlow['prefill']
  loadFailed?: boolean
  rating?: number
  tags?: string[]
  errors?: AddFlowErrors
  formError?: string | null
}

function setup({
  mode = 'create',
  prefill = 'none',
  loadFailed = false,
  rating = 5,
  tags = [],
  errors = {},
  formError = null,
}: SetupOptions = {}) {
  const props = {
    onChangeItem: vi.fn(),
    onRatingChange: vi.fn(),
    onTagsChange: vi.fn(),
    onReload: vi.fn(),
    onRetry: vi.fn(),
    onSubmit: vi.fn(),
  }

  function Harness({ prefill }: { prefill: AddFlow['prefill'] }) {
    const [state, setState] = useState({ rating, tags })
    return (
      <RateStep
        id="rate"
        item={makeSearchResult()}
        ratingLabel="IGDB"
        mode={mode}
        rating={state.rating}
        tags={state.tags}
        prefill={prefill}
        loadFailed={loadFailed}
        reloading={false}
        errors={errors}
        formError={formError}
        retrying={false}
        {...props}
        onRatingChange={(value) => {
          props.onRatingChange(value)
          setState((current) => ({ ...current, rating: value }))
        }}
        onTagsChange={(value) => {
          props.onTagsChange(value)
          setState((current) => ({ ...current, tags: value }))
        }}
      />
    )
  }

  const view = renderWithClient(<Harness prefill={prefill} />)
  return {
    ...view,
    ...props,
    rerenderWith: (next: AddFlow['prefill']) =>
      view.rerender(<Harness prefill={next} />),
    user: userEvent.setup(),
  }
}

const slider = () => screen.getByRole('slider', { name: 'Your rating' })
const tagsField = () => screen.getByRole('textbox', { name: /^Tags/ })

it('shows the picked title, the rating and the tags', () => {
  setup({ rating: 7.5, tags: ['cozy'] })

  expect(screen.getByText('The Witcher 3: Wild Hunt')).toBeInTheDocument()
  expect(screen.getByText('IGDB 9.3')).toBeInTheDocument()
  expect(slider()).toHaveAttribute('aria-valuenow', '7.5')
  expect(tagsField()).toHaveValue('cozy')
  expect(screen.getByText('(optional)')).toBeInTheDocument()
  expect(screen.queryByText(/Already in your reviews/)).not.toBeInTheDocument()
})

it('starts on the rating', () => {
  setup()

  expect(slider()).toHaveFocus()
})

it('sends rating and tag changes up', async () => {
  const { user, onRatingChange, onTagsChange } = setup({ tags: ['cozy'] })

  await user.keyboard('{ArrowRight}')
  expect(onRatingChange).toHaveBeenLastCalledWith(5.1)

  await user.type(tagsField(), ', jazz')
  expect(onTagsChange).toHaveBeenLastCalledWith(['cozy', 'jazz'])
})

it('adds a tapped suggestion to the tags', async () => {
  const { user, onTagsChange } = setup({ tags: ['cozy'] })

  await user.click(await screen.findByRole('button', { name: '+ comfort' }))

  expect(onTagsChange).toHaveBeenLastCalledWith(['cozy', 'comfort'])
})

it('calls onChangeItem from Change', async () => {
  const { user, onChangeItem } = setup()

  await user.click(screen.getByRole('button', { name: 'Change' }))

  expect(onChangeItem).toHaveBeenCalledOnce()
})

it('submits on Enter in the tags', async () => {
  const { user, onSubmit } = setup()

  await user.type(tagsField(), '{Enter}')

  expect(onSubmit).toHaveBeenCalledOnce()
})

it('says an update changes the existing review', () => {
  setup({ mode: 'update' })

  expect(
    screen.getByText('Already in your reviews — your changes will update it.'),
  ).toBeInTheDocument()
})

it('holds the ruler back while the review loads, then focuses it', () => {
  const { rerenderWith } = setup({ mode: 'update', prefill: 'loading' })

  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading your review')
  expect(tagsField()).toBeDisabled()

  rerenderWith('done')

  expect(slider()).toHaveFocus()
  expect(tagsField()).toBeEnabled()
})

it('offers to load the review again when it fails', async () => {
  const { user, onReload } = setup({
    mode: 'update',
    prefill: 'loading',
    loadFailed: true,
  })

  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t load your review.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onReload).toHaveBeenCalledOnce()
})

it('shows the server’s messages under their fields', () => {
  setup({ errors: { rating: 'At most 10.', tags: 'Letters only.' } })

  expect(
    screen.getByRole('group', { name: 'Your rating' }),
  ).toHaveAccessibleDescription('At most 10.')
  expect(tagsField()).toHaveAccessibleDescription('Letters only.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a message for the whole save, with Try again', async () => {
  const { user, onRetry } = setup({ formError: 'Couldn’t save. Try again.' })

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t save. Try again.',
  )
  const form = screen.getByRole('alert').parentElement as HTMLElement
  await user.click(within(form).getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('has no axe violations', async () => {
  const { container } = setup({
    mode: 'update',
    errors: { rating: 'At most 10.', tags: 'Letters only.' },
    formError: 'Couldn’t save. Try again.',
  })
  await screen.findByRole('button', { name: '+ comfort' })

  await expectNoAxeViolations(container)
}, 30_000)
