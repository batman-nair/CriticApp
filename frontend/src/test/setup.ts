import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, expect } from 'vitest'
import { rejectUnhandledRequest, server, takeUnhandledRequests } from './server'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// React Testing Library sets this flag and registers cleanup only when Vitest
// globals are on. Without the flag React drops its "not wrapped in act" warning.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(cleanup)

// setupFiles also runs for tests in the node environment, and MSW would
// intercept the real local HTTP traffic in vite.config.test.ts.
if (typeof document !== 'undefined') {
  // Not in beforeAll: openapi-fetch captures fetch when client.ts is imported,
  // which happens before any beforeAll, and would then bypass MSW.
  server.listen({ onUnhandledRequest: rejectUnhandledRequest })

  const expectNoUnhandledRequests = () =>
    expect(takeUnhandledRequests(), 'requests with no MSW handler').toEqual([])

  afterEach(() => {
    server.resetHandlers()
    expectNoUnhandledRequests()
  })

  // Also catches a request that arrived after the last test's check.
  afterAll(() => {
    server.close()
    expectNoUnhandledRequests()
  })
}
