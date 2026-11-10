// Dev-only page at /ui-gallery.html. Issues adding shared components
// (#83, #84, #85) add a section here, covering every state.
import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { useTheme } from '../../layout/useTheme'
import { Button } from '../Button/Button'
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from '../Button/buttonClass'
import { Chip } from '../Chip/Chip'
import { Dialog } from '../Dialog/Dialog'
import { Icon, type IconName } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'
import { Poster } from '../Poster/Poster'
import { RatingBadge } from '../RatingBadge/RatingBadge'
import { RulerPicker } from '../RulerPicker/RulerPicker'
import { SearchField } from '../SearchField/SearchField'
import { Select } from '../Select/Select'
import { Skeleton } from '../Skeleton/Skeleton'
import { Stepper } from '../Stepper/Stepper'
import { TextArea } from '../TextArea/TextArea'
import { TextField } from '../TextField/TextField'
import styles from './Gallery.module.css'

const CATEGORIES = [
  { id: 'movie', label: 'Movie' },
  { id: 'series', label: 'Series' },
  { id: 'game', label: 'Game' },
  { id: 'anime:series', label: 'Anime series' },
  { id: 'anime:movie', label: 'Anime movie' },
  { id: 'manga', label: 'Manga' },
  { id: 'book', label: 'Book' },
]

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost']
const BUTTON_SIZES: ButtonSize[] = ['sm', 'md', 'lg']
const ICON_BUTTON_VARIANTS = ['ghost', 'soft', 'outline'] as const
const ICON_BUTTON_SIZES = ['sm', 'md'] as const

const ICON_NAMES: IconName[] = [
  'search',
  'moon',
  'sun',
  'plus',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'x',
  'pencil',
  'trash',
  'star',
  'lock',
]

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently reviewed' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'title', label: 'Title' },
]

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
]

const LONG_OPTIONS = Array.from({ length: 40 }, (_, index) => ({
  value: `language-${index + 1}`,
  label: `Language ${index + 1}`,
}))

const POSTER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="#3d6a94"/><circle cx="100" cy="120" r="56" fill="#e0ba76"/><rect y="210" width="200" height="90" fill="#2a2622"/></svg>',
)}`

const LONG_TEXT =
  'A slow, patient film that keeps its best idea back until the last act.'

const ADD_STEPS = ['Find', 'Rate', 'Write']
const EDIT_STEPS = ['Rate', 'Write']

const LONG_BODY = Array.from({ length: 30 }, (_, index) => (
  <p key={index}>{LONG_TEXT}</p>
))

type ChipDemoProps = Omit<
  ComponentProps<typeof Chip>,
  'selected' | 'onClick'
> & {
  initiallySelected?: boolean
}

function ChipDemo({ initiallySelected = false, ...props }: ChipDemoProps) {
  const [selected, setSelected] = useState(initiallySelected)

  return (
    <Chip
      {...props}
      selected={selected}
      onClick={() => setSelected(!selected)}
    />
  )
}

type SelectDemoProps = Omit<
  ComponentProps<typeof Select>,
  'value' | 'onValueChange'
> & {
  initial: string
}

function SelectDemo({ initial, ...props }: SelectDemoProps) {
  const [value, setValue] = useState(initial)

  return <Select {...props} value={value} onValueChange={setValue} />
}

type TextFieldDemoProps = Omit<
  ComponentProps<typeof TextField>,
  'value' | 'onChange'
> & {
  initial?: string
}

function TextFieldDemo({ initial = '', ...props }: TextFieldDemoProps) {
  const [value, setValue] = useState(initial)

  return (
    <TextField
      {...props}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

type TextAreaDemoProps = Omit<
  ComponentProps<typeof TextArea>,
  'value' | 'onChange'
> & {
  initial?: string
}

function TextAreaDemo({ initial = '', ...props }: TextAreaDemoProps) {
  const [value, setValue] = useState(initial)

  return (
    <TextArea
      {...props}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

type SearchFieldDemoProps = Omit<
  ComponentProps<typeof SearchField>,
  'value' | 'onValueChange'
> & {
  initial?: string
}

function SearchFieldDemo({ initial = '', ...props }: SearchFieldDemoProps) {
  const [value, setValue] = useState(initial)

  return <SearchField {...props} value={value} onValueChange={setValue} />
}

// Distributes over the props union, which a plain Omit would flatten.
type RulerPickerDemoProps<P = ComponentProps<typeof RulerPicker>> =
  P extends unknown
    ? Omit<P, 'value' | 'onChange'> & { initial: number }
    : never

function RulerPickerDemo({ initial, ...props }: RulerPickerDemoProps) {
  const [value, setValue] = useState(initial)

  return <RulerPicker {...props} value={value} onChange={setValue} />
}

type DialogDemoProps = Omit<
  ComponentProps<typeof Dialog>,
  'open' | 'onOpenChange'
> & {
  opener: string
}

function DialogDemo({ opener, ...props }: DialogDemoProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {opener}
      </Button>
      <Dialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}

function DialogNavButtons() {
  return (
    <div className={styles.dialogButtons}>
      <IconButton variant="soft" label="Previous review">
        <Icon name="chevron-left" size={18} />
      </IconButton>
      <IconButton variant="soft" label="Next review">
        <Icon name="chevron-right" size={18} />
      </IconButton>
    </div>
  )
}

function DialogActionButtons() {
  return (
    <div className={styles.dialogButtons}>
      <IconButton variant="soft" label="Edit">
        <Icon name="pencil" size={17} />
      </IconButton>
      <IconButton variant="soft" label="Delete">
        <Icon name="trash" size={17} />
      </IconButton>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <p className={styles.groupLabel}>{label}</p>
      <div className={styles.row}>{children}</div>
    </div>
  )
}

function Captioned({
  caption,
  children,
}: {
  caption: string
  children: ReactNode
}) {
  return (
    <figure className={styles.captioned}>
      {children}
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <IconButton
      variant="ghost"
      label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      onClick={toggle}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={20} />
    </IconButton>
  )
}

export function Gallery() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className={styles.title}>Critic UI gallery</h1>
        <ThemeToggle />
      </header>

      <main>
        <Section title="Button">
          {BUTTON_VARIANTS.map((variant) => (
            <Row key={variant} label={variant}>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
              <Button variant={variant} disabled>
                disabled
              </Button>
              <Button variant={variant} busy>
                busy
              </Button>
            </Row>
          ))}
          <Row label="buttonClass on a link">
            <a href="#" className={buttonClass()}>
              Primary link
            </a>
            <a
              href="#"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Secondary link
            </a>
            <a
              href="#"
              className={buttonClass({ variant: 'ghost', size: 'lg' })}
            >
              Ghost link
            </a>
          </Row>
        </Section>

        <Section title="IconButton">
          {ICON_BUTTON_VARIANTS.map((variant) => (
            <Row key={variant} label={variant}>
              {ICON_BUTTON_SIZES.map((size) => (
                <IconButton
                  key={size}
                  variant={variant}
                  size={size}
                  label={`${variant} ${size}`}
                >
                  <Icon name="plus" size={18} />
                </IconButton>
              ))}
              <IconButton
                variant={variant}
                label={`${variant} disabled`}
                disabled
              >
                <Icon name="plus" size={18} />
              </IconButton>
            </Row>
          ))}
        </Section>

        <Section title="Icon">
          <Row label="All names, 24px">
            {ICON_NAMES.map((name) => (
              <Captioned key={name} caption={name}>
                <Icon name={name} size={24} />
              </Captioned>
            ))}
          </Row>
          <Row label="Default size, and a heavier stroke">
            <Icon name="search" />
            <Icon name="search" size={24} strokeWidth={3} />
          </Row>
        </Section>

        <Section title="Chip">
          <Row label="No category">
            <ChipDemo>All, unselected</ChipDemo>
            <ChipDemo initiallySelected>All, selected</ChipDemo>
          </Row>
          <Row label="Categories, unselected">
            {CATEGORIES.map(({ id, label }, index) => (
              <ChipDemo key={id} category={id} count={index}>
                {label}
              </ChipDemo>
            ))}
          </Row>
          <Row label="Categories, selected">
            {CATEGORIES.map(({ id, label }, index) => (
              <ChipDemo key={id} category={id} count={index} initiallySelected>
                {label}
              </ChipDemo>
            ))}
          </Row>
          <Row label="Disabled">
            <ChipDemo category="movie" disabled>
              Movie, disabled
            </ChipDemo>
          </Row>
          <Row label="Suggestion">
            <Chip variant="suggestion">Drama</Chip>
            <Chip variant="suggestion" disabled>
              Disabled suggestion
            </Chip>
          </Row>
        </Section>

        <Section title="Select">
          <Row label="Default, empty-string option, disabled">
            <SelectDemo label="Sort" options={SORT_OPTIONS} initial="recent" />
            <SelectDemo
              label="Language"
              options={LANGUAGE_OPTIONS}
              initial=""
            />
            <SelectDemo
              label="Sort, disabled"
              options={SORT_OPTIONS}
              initial="title"
              disabled
            />
          </Row>
          <Row label="Long list (open at phone width)">
            <SelectDemo
              label="Long language list"
              options={LONG_OPTIONS}
              initial="language-1"
            />
          </Row>
        </Section>

        <Section title="TextField">
          <div className={styles.fields}>
            <TextFieldDemo label="Empty field" placeholder="Placeholder" />
            <TextFieldDemo label="Filled field" initial="Arrival" />
            <TextFieldDemo
              label="Field with an error"
              initial="Arrival"
              error="A review for this title already exists."
            />
            <TextFieldDemo label="Disabled field" initial="Arrival" disabled />
          </div>
        </Section>

        <Section title="TextArea">
          <div className={styles.fields}>
            <TextAreaDemo label="Empty area" placeholder="Placeholder" />
            <TextAreaDemo
              label="Area under the limit"
              initial={LONG_TEXT}
              counterMax={200}
            />
            <TextAreaDemo
              label="Area over the limit"
              initial={LONG_TEXT}
              counterMax={40}
            />
            <TextAreaDemo
              label="Area with an error"
              error="Write at least a few words."
            />
            <TextAreaDemo
              label="Area with an error and counter"
              initial={LONG_TEXT}
              counterMax={40}
              error="This is too long."
            />
            <TextAreaDemo label="Disabled area" initial={LONG_TEXT} disabled />
          </div>
        </Section>

        <Section title="SearchField">
          <div className={styles.fields}>
            <SearchFieldDemo
              label="Panel search, empty"
              placeholder="Search your reviews"
              clearLabel="Clear panel search, empty"
            />
            <SearchFieldDemo
              label="Panel search, filled"
              initial="Arrival"
              clearLabel="Clear panel search, filled"
            />
            <SearchFieldDemo
              tone="sheet"
              label="Sheet search, empty"
              placeholder="Search titles"
              clearLabel="Clear sheet search, empty"
            />
            <SearchFieldDemo
              tone="sheet"
              label="Sheet search, filled"
              initial="Arrival"
              clearLabel="Clear sheet search, filled"
            />
            <SearchFieldDemo
              label="Disabled search"
              initial="Arrival"
              clearLabel="Clear disabled search"
              disabled
            />
          </div>
        </Section>

        <Section title="Poster">
          <Row label="Sources">
            <Captioned caption="Image">
              <Poster
                src={POSTER_IMAGE}
                title="Arrival"
                alt="Sample poster"
                category="series"
                className={styles.poster120}
              />
            </Captioned>
            <Captioned caption="No URL">
              <Poster
                title="Arrival"
                category="series"
                className={styles.poster120}
              />
            </Captioned>
            <Captioned caption="Broken URL">
              <Poster
                src="/does-not-exist.png"
                title="Arrival"
                alt="Broken poster"
                category="series"
                className={styles.poster120}
              />
            </Captioned>
          </Row>
          <Row label="Categories">
            {CATEGORIES.map(({ id, label }) => (
              <Captioned key={id} caption={label}>
                <Poster
                  title={label}
                  category={id}
                  className={styles.poster120}
                />
              </Captioned>
            ))}
          </Row>
          <Row label="Sizes">
            <Captioned caption="120">
              <Poster
                src={POSTER_IMAGE}
                title="Arrival"
                className={styles.poster120}
              />
            </Captioned>
            <Captioned caption="52">
              <Poster
                src={POSTER_IMAGE}
                title="Arrival"
                className={styles.poster52}
              />
            </Captioned>
            <Captioned caption="44">
              <Poster
                src={POSTER_IMAGE}
                title="Arrival"
                className={styles.poster44}
              />
            </Captioned>
            <Captioned caption="44, no URL">
              <Poster
                title="Arrival"
                category="manga"
                className={styles.poster44}
              />
            </Captioned>
          </Row>
        </Section>

        <Section title="RatingBadge">
          <Row label="Categories">
            {CATEGORIES.map(({ id }) => (
              <RatingBadge key={id} category={id} rating={8.5} />
            ))}
          </Row>
          <Row label="Whole number, not rated">
            <RatingBadge category="movie" rating={9} />
            <RatingBadge category="movie" rating={null} />
          </Row>
          <Row label="Provider">
            {CATEGORIES.map(({ id }) => (
              <RatingBadge
                key={id}
                variant="provider"
                provider="IMDb"
                category={id}
                rating={6.5}
              />
            ))}
          </Row>
          <Row label="Provider with no rating (renders nothing)">
            <RatingBadge
              variant="provider"
              provider="IMDb"
              category="movie"
              rating={null}
            />
          </Row>
        </Section>

        <Section title="Skeleton">
          <Row label="Bars">
            <div className={styles.skeletonBars}>
              <Skeleton height={18} width="80%" />
              <Skeleton height={14} width="55%" delay={0.15} />
              <Skeleton height={14} width="40%" delay={0.3} />
            </div>
          </Row>
          <Row label="Poster-shaped block">
            <Skeleton width={120} aspectRatio="2 / 3" radius={12} />
            <Skeleton width={52} aspectRatio="2 / 3" radius={8} delay={0.15} />
          </Row>
        </Section>

        <Section title="RulerPicker">
          <div className={styles.rulers}>
            <RulerPickerDemo label="Inline" category="movie" initial={7.5} />
            <RulerPickerDemo
              layout="stacked"
              label="Stacked, with an aside"
              category="series"
              initial={8.2}
              labelAside={
                <RatingBadge
                  variant="provider"
                  provider="IMDb"
                  category="series"
                  rating={8}
                />
              }
            />
            <RulerPickerDemo label="At 0" category="game" initial={0} />
            <RulerPickerDemo label="At 10" category="game" initial={10} />
            <RulerPickerDemo
              label="Two decimals (7.55)"
              category="manga"
              initial={7.55}
            />
            {CATEGORIES.map(({ id, label }, index) => (
              <RulerPickerDemo
                key={id}
                label={label}
                category={id}
                initial={index + 2.5}
              />
            ))}
            <div className={styles.rulerTinted}>
              <RulerPickerDemo
                layout="stacked"
                label="Tinted fade"
                category="game"
                initial={6.4}
              />
            </div>
            <div className={styles.rulerBleed}>
              <RulerPickerDemo
                label="Bleeds into the padding on phones"
                category="book"
                initial={5}
              />
            </div>
          </div>
        </Section>
        <Section title="Dialog">
          <Row label="Detail">
            <DialogDemo
              opener="Detail, with category"
              title="Arrival"
              category="movie"
              headerStart={<DialogNavButtons />}
              headerEnd={<DialogActionButtons />}
            >
              <p>{LONG_TEXT}</p>
            </DialogDemo>
            <DialogDemo
              opener="Detail, long body"
              title="Arrival"
              category="series"
              headerEnd={<DialogActionButtons />}
            >
              {LONG_BODY}
            </DialogDemo>
            <DialogDemo opener="Detail, hidden title" title="Arrival" hideTitle>
              <p>{LONG_TEXT}</p>
            </DialogDemo>
          </Row>
          <Row label="Add sheet">
            <DialogDemo
              opener="Add sheet"
              title="Add a review"
              size="add"
              category="game"
              headerStart={
                <Stepper
                  label="Add review progress"
                  steps={ADD_STEPS}
                  current={1}
                  category="game"
                />
              }
              footer={<Button>Next</Button>}
            >
              <p>{LONG_TEXT}</p>
            </DialogDemo>
          </Row>
        </Section>

        <Section title="Stepper">
          <div className={styles.steppers}>
            {[0, 1, 2].map((current) => (
              <Stepper
                key={current}
                label={`Step ${current + 1}, no category`}
                steps={ADD_STEPS}
                current={current}
              />
            ))}
            {CATEGORIES.map(({ id, label }) => (
              <Stepper
                key={id}
                label={`${label} progress`}
                steps={ADD_STEPS}
                current={1}
                category={id}
              />
            ))}
            <Stepper
              label="All done"
              steps={ADD_STEPS}
              current={ADD_STEPS.length}
              category="movie"
            />
            <Stepper
              label="Two steps"
              steps={EDIT_STEPS}
              current={0}
              category="book"
            />
          </div>
        </Section>
      </main>
    </div>
  )
}
