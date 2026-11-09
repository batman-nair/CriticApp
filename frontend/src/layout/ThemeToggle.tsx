import { Icon } from '../ui/Icon/Icon'
import { IconButton } from '../ui/IconButton/IconButton'
import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return (
    <IconButton
      label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={19} strokeWidth={1.7} />
    </IconButton>
  )
}
