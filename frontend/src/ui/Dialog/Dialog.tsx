import * as RadixDialog from '@radix-ui/react-dialog'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type RefObject,
  type ReactNode,
} from 'react'
import { categoryVars } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Dialog.module.css'
import { useKeyboardInset } from './useKeyboardInset'
import { useSheetDrag } from './useSheetDrag'

type KeyboardInsetVars = CSSProperties & Record<'--keyboard-inset', string>

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The close animation has finished. */
  onExited?: () => void
  title: string
  hideTitle?: boolean
  /**
   * A line under the visible title, read as the dialog's description. Left
   * out with `hideTitle`.
   */
  description?: ReactNode
  /** On the description itself, such as to hide it at some widths. */
  descriptionClassName?: string
  size?: 'detail' | 'add'
  category?: string
  /** A stepper, or ‹ ›. */
  headerStart?: ReactNode
  /** Actions such as Edit and Delete, placed before Close. */
  headerEnd?: ReactNode
  /** Leaves out Close, for a header whose actions include their own Cancel. */
  hideClose?: boolean
  /**
   * False ignores Esc, clicks outside and dragging the sheet down, which
   * springs back, such as while there are unsaved changes. Close still works.
   */
  dismissible?: boolean
  footer?: ReactNode
  /** A new value remounts the body, so it starts scrolled to the top. */
  bodyKey?: Key
  children: ReactNode
}

/** Where a dialog returns focus to when it closes. */
interface Opener {
  element: Element | null
  /**
   * The opener of the dialog `element` is in, if any: where focus goes when
   * this dialog replaced that one, taking `element` with it.
   */
  parent?: Opener
}

const openers = new WeakMap<Element, RefObject<Opener>>()

function returnFocus(opener: Opener | undefined) {
  if (!opener) return
  const { element } = opener
  if (element instanceof HTMLElement && element.isConnected) element.focus()
  else returnFocus(opener.parent)
}

export function Dialog({
  open,
  onOpenChange,
  onExited,
  title,
  hideTitle = false,
  description,
  descriptionClassName,
  size = 'detail',
  category,
  headerStart,
  headerEnd,
  hideClose = false,
  dismissible = true,
  footer,
  bodyKey,
  children,
}: DialogProps) {
  // Radix only returns focus to its own Trigger, and these dialogs open from
  // links. Read here rather than in onOpenAutoFocus, which FocusScope skips
  // when a child has already taken focus with autoFocus.
  const [wasOpen, setWasOpen] = useState(false)
  const [opener, setOpener] = useState<Opener>({ element: null })
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const element = document.activeElement
      // Opened from inside another dialog, which this one may replace.
      const parent = element?.closest('[role="dialog"]')
      setOpener({
        element,
        parent: parent ? openers.get(parent)?.current : undefined,
      })
    }
  }

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // So a dialog opened from inside this one can find where this one returns
  // focus to. A callback ref, as the portal mounts the content after this
  // component's effects have run.
  const openerRef = useRef(opener)
  useEffect(() => {
    openerRef.current = opener
  }, [opener])
  const contentRef = useRef<HTMLDivElement | null>(null)
  const setContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node
    if (node) openers.set(node, openerRef)
  }, [])
  const drag = useSheetDrag(
    contentRef,
    dismissible ? () => onOpenChange(false) : undefined,
  )
  // The add sheet's footer has to stay above the phone keyboard.
  const keyboardInset = useKeyboardInset(open && size === 'add')
  const catVars = category ? categoryVars(category) : undefined
  const style: KeyboardInsetVars | CSSProperties | undefined =
    size === 'add'
      ? { ...catVars, '--keyboard-inset': `${keyboardInset}px` }
      : catVars

  const keepOpen = (event: Event) => {
    if (!dismissible) event.preventDefault()
  }

  // FocusScope sends this once the content has unmounted, which Presence holds
  // back until the exit animation ends. A route unmounted by the browser's Back
  // sends it too, with `open` still true or the Dialog already gone.
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    returnFocus(opener)
    if (!open && mounted.current) onExited?.()
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          ref={setContent}
          className={cx(
            styles.content,
            styles[size],
            category && styles.tinted,
          )}
          style={style}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={keepOpen}
          onInteractOutside={keepOpen}
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
              ) : description ? (
                <div className={styles.titles}>
                  <RadixDialog.Title className={styles.title}>
                    {title}
                  </RadixDialog.Title>
                  <RadixDialog.Description
                    className={cx(styles.description, descriptionClassName)}
                  >
                    {description}
                  </RadixDialog.Description>
                </div>
              ) : (
                <RadixDialog.Title className={styles.title}>
                  {title}
                </RadixDialog.Title>
              )}
            </div>
            <div className={styles.end}>
              {headerEnd}
              {!hideClose && (
                <RadixDialog.Close asChild>
                  <IconButton
                    label="Close"
                    variant="soft"
                    className={styles.close}
                  >
                    <Icon name="x" />
                  </IconButton>
                </RadixDialog.Close>
              )}
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
