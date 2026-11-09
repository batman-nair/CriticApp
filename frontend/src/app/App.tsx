// Not from 'react-router/dom', which under Vitest loads a second copy of the
// router and leaves Link without its context.
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export function App() {
  return <RouterProvider router={router} />
}
