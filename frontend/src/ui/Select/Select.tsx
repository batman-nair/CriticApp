import * as RadixSelect from '@radix-ui/react-select'
import { Icon } from '../Icon/Icon'
import styles from './Select.module.css'

// Radix treats '' as "no value", which would leave the trigger blank.
const EMPTY_VALUE = '__critic-select-empty__'

const toRadix = (value: string) => (value === '' ? EMPTY_VALUE : value)
const fromRadix = (value: string) => (value === EMPTY_VALUE ? '' : value)

interface SelectProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}

export function Select({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: SelectProps) {
  return (
    <RadixSelect.Root
      value={toRadix(value)}
      onValueChange={(next) => onValueChange(fromRadix(next))}
      disabled={disabled}
    >
      <RadixSelect.Trigger aria-label={label} className={styles.trigger}>
        <RadixSelect.Value />
        <RadixSelect.Icon className={styles.chevron}>
          <Icon name="chevron-down" size={14} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className={styles.content}
        >
          {/* Radix hides the scrollbar, so these show that a long list scrolls. */}
          <RadixSelect.ScrollUpButton className={styles.scrollButton}>
            <Icon name="chevron-down" size={14} className={styles.up} />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={toRadix(option.value)}
                className={styles.item}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className={styles.scrollButton}>
            <Icon name="chevron-down" size={14} />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
