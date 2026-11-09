import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { createQueryClient } from '../api/queryClient'

const queryClient = createQueryClient()

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Renders nothing outside development builds. */}
      <ReactQueryDevtools />
    </QueryClientProvider>
  )
}
