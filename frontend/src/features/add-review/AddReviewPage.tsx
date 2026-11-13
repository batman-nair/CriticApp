import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { Dialog } from '../../ui/Dialog/Dialog'
import { useRouteDialog } from '../../ui/Dialog/useRouteDialog'
import { Stepper } from '../../ui/Stepper/Stepper'
import styles from './AddReviewPage.module.css'
import { FindStep } from './FindStep'
import { readLastCategory } from './lastCategory'
import { RatePlaceholder } from './RatePlaceholder'
import { useAddFlow, type AddStep } from './useAddFlow'

const STEPS = ['Find', 'Rate', 'Write']

const STEP_INDEX: Record<AddStep, number> = { find: 0, rate: 1, write: 2 }

export function AddReviewPage() {
  const dialog = useRouteDialog()
  const [initialCategory] = useState(() => readLastCategory() ?? 'movie')
  const [flow, dispatch] = useAddFlow(initialCategory)

  let title
  let body
  let footer
  if (flow.step !== 'find' && flow.item) {
    // A placeholder until #92 builds Rate and Write.
    title = 'Rate it'
    body = <RatePlaceholder item={flow.item} />
    footer = (
      <Button variant="secondary" onClick={() => dispatch({ type: 'back' })}>
        Back
      </Button>
    )
  } else {
    title = 'What are you adding?'
    body = (
      <FindStep
        category={flow.category}
        query={flow.query}
        onCategoryChange={(category) =>
          dispatch({ type: 'categoryChanged', category })
        }
        onQueryChange={(query) => dispatch({ type: 'queryChanged', query })}
        onSelect={(item) => dispatch({ type: 'itemSelected', item })}
      />
    )
    footer = <p className={styles.footerText}>Pick a result to continue</p>
  }

  // One Dialog for every step, so it keeps the element to return focus to.
  return (
    <Dialog
      {...dialog}
      size="add"
      title={title}
      headerStart={
        <Stepper
          label="Add review steps"
          steps={STEPS}
          current={STEP_INDEX[flow.step]}
          category={flow.category}
        />
      }
      bodyKey={flow.step}
      footer={footer}
    >
      {body}
    </Dialog>
  )
}
