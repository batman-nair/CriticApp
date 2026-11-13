import * as RadixDialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState, type Key, type ReactNode } from 'react'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Dialog.module.css'
import { useSheetDrag } from './useSheetDrag'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The close animation has finished. */
  onExited?: () => void
  title: string
  hideTitle?: boolean
  size?: 'detail' | 'add'
  category?: string
  /** A stepper, or ‹ ›. */
  headerStart?: ReactNode
  /** Actions such as Edit and Delete, placed before Close. */
  headerEnd?: ReactNode
  footer?: ReactNode
  /** A new value remounts the body, so it starts scrolled to the top. */
  bodyKey?: Key
  children: ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  onExited,
  title,
  hideTitle = false,
  size = 'detail',
  category,
  headerStart,
  headerEnd,
  footer,
  bodyKey,
  children,
}: DialogProps) {
  // Radix only returns focus to its own Trigger, and these dialogs open from
  // links. Read here rather than in onOpenAutoFocus, which FocusScope skips
  // when a child has already taken focus with autoFocus.
  const [wasOpen, setWasOpen] = useState(false)
  const [opener, setOpener] = useState<Element | null>(null)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpener(document.activeElement)
  }

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useSheetDrag(contentRef, () => onOpenChange(false))

  // FocusScope sends this once the content has unmounted, which Presence holds
  // back until the exit animation ends. A route unmounted by the browser's Back
  // sends it too, with `open` still true or the Dialog already gone.
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    if (!open && mounted.current) onExited?.()
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          ref={contentRef}
          className={cx(
            styles.content,
            styles[size],
            category && styles.tinted,
          )}
          style={category ? categoryVars(category) : undefined}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className={styles.handle} aria-hidden="true" {...drag} />
          {/* The body doesn't drag, so it keeps its own scrolling. */}
          <div className={styles.header} {...drag}>
            <div className={styles.start}>
              {headerStart}
              {hideTitle ? (
                <VisuallyHidden>
                  <RadixDialog.Title asChild>
                    <span>{title}</span>
                  </RadixDialog.Title>
                </VisuallyHidden>
              ) : (
                <RadixDialog.Title className={styles.title}>
                  {title}
                </RadixDialog.Title>
              )}
            </div>
            <div className={styles.end}>
              {headerEnd}
              <RadixDialog.Close asChild>
                <IconButton
                  label="Close"
                  variant="soft"
                  className={styles.close}
                >
                  <Icon name="x" />
                </IconButton>
              </RadixDialog.Close>
            </div>
          </div>
          {/* Focusable so that a long body can be scrolled from the keyboard. */}
          <div key={bodyKey} className={styles.body} tabIndex={0}>
            {children}
          </div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
