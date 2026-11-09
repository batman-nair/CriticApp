import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)

const unhandledRequests: string[] = []

/**
 * Pass as onUnhandledRequest. The throw keeps the request off the real network,
 * and the caller gets a 500. It's the check in setup.ts that fails the test,
 * because code under test can handle a failed request and carry on.
 */
export function rejectUnhandledRequest(request: Request): never {
  const description = `${request.method} ${request.url}`
  unhandledRequests.push(description)
  throw new Error(`No MSW handler for ${description}`)
}

export function takeUnhandledRequests() {
  return unhandledRequests.splice(0)
}
