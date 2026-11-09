import type { CSSProperties } from 'react'
import { cx } from '../../lib/cx'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  aspectRatio?: string
  radius?: number
  delay?: number
  className?: string
}

function toLength(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

export function Skeleton({
  width,
  height,
  aspectRatio,
  radius,
  delay,
  className,
}: SkeletonProps) {
  const vars: Record<string, string> = {}
  if (width !== undefined) vars['--skeleton-width'] = toLength(width)
  if (height !== undefined) vars['--skeleton-height'] = toLength(height)
  if (aspectRatio !== undefined) vars['--skeleton-aspect-ratio'] = aspectRatio
  if (radius !== undefined) vars['--skeleton-radius'] = toLength(radius)
  if (delay !== undefined) vars['--skeleton-delay'] = `${delay}s`

  return (
    <div
      aria-hidden="true"
      className={cx(styles.root, className)}
      style={vars as CSSProperties}
    />
  )
}
