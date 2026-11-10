import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import styles from './Stepper.module.css'

interface StepperProps {
  label: string
  steps: string[]
  /** 0-based. `steps.length` means every step is done. */
  current: number
  category?: string
}

export function Stepper({ label, steps, current, category }: StepperProps) {
  return (
    <ol
      aria-label={label}
      className={styles.root}
      style={category ? categoryVars(category) : undefined}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={cx(
            styles.step,
            index < current && styles.done,
            index === current && styles.current,
          )}
        >
          {step}
        </li>
      ))}
    </ol>
  )
}
