import type { RouteObject } from 'react-router'
import { LoginPage } from '../auth/LoginPage'
import { RequireOwner } from '../auth/RequireOwner'
import { AddReviewPage } from '../features/add-review/AddReviewPage'
import { ReviewDetailPage } from '../features/review-detail/ReviewDetailPage'
import { ReviewListPage } from '../features/review-list/ReviewListPage'
import { AppLayout } from '../layout/AppLayout'
import { DialogErrorPage } from '../layout/DialogErrorPage'
import { NotFoundPage } from '../layout/NotFoundPage'
import { ServerErrorPage } from '../layout/ServerErrorPage'
import { Root } from './Root'

export const routes: RouteObject[] = [
  {
    element: <Root />,
    // Only when the layout itself throws.
    errorElement: <ServerErrorPage standalone />,
    children: [
      // Outside the shell: the login page has no header or footer.
      { path: 'login', element: <LoginPage />, handle: { title: 'Log in' } },
      {
        element: <AppLayout />,
        children: [
          {
            // Pathless, so the header and footer survive a page crash.
            errorElement: <ServerErrorPage />,
            children: [
              {
                path: '/',
                element: <ReviewListPage />,
                children: [
                  {
                    path: 'reviews/:id',
                    element: <ReviewDetailPage />,
                    // A crash in the dialog leaves the list behind it.
                    errorElement: <DialogErrorPage />,
                    handle: { title: 'Review' },
                  },
                  {
                    path: 'add',
                    element: (
                      <RequireOwner>
                        <AddReviewPage />
                      </RequireOwner>
                    ),
                    handle: { title: 'Add review' },
                  },
                ],
              },
              {
                path: '*',
                element: <NotFoundPage />,
                handle: { title: 'Page not found' },
              },
            ],
          },
        ],
      },
    ],
  },
]
