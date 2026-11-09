import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// React Testing Library sets this flag and registers cleanup only when Vitest
// globals are on. Without the flag React drops its "not wrapped in act" warning.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(cleanup)
