import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Feedback'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { RequireAdmin, RequireAuth } from '@/components/common/Guards'
import { RouteError } from '@/pages/RouteError'
import { HomePage } from '@/pages/HomePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
})

/** Code-split a page module that exports a named component. */
function page<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  const Component = lazy<ComponentType>(async () => ({ default: (await loader())[name] }))
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'predictor', element: page(() => import('@/pages/PredictorPage'), 'PredictorPage') },
      { path: 'colleges', element: page(() => import('@/pages/CollegesPage'), 'CollegesPage') },
      { path: 'colleges/:code', element: page(() => import('@/pages/CollegeDetailPage'), 'CollegeDetailPage') },
      { path: 'cutoffs', element: page(() => import('@/pages/CutoffExplorerPage'), 'CutoffExplorerPage') },
      { path: 'compare', element: page(() => import('@/pages/ComparePage'), 'ComparePage') },
      { path: 'choice-filling', element: page(() => import('@/pages/ChoiceFillingPage'), 'ChoiceFillingPage') },
      { path: 'sources', element: page(() => import('@/pages/SourcesPage'), 'SourcesPage') },
      { path: 'about', element: page(() => import('@/pages/InfoPages'), 'AboutPage') },
      { path: 'disclaimer', element: page(() => import('@/pages/InfoPages'), 'DisclaimerPage') },
      { path: 'privacy', element: page(() => import('@/pages/InfoPages'), 'PrivacyPage') },
      { path: 'terms', element: page(() => import('@/pages/InfoPages'), 'TermsPage') },
      { path: 'auth/login', element: page(() => import('@/pages/auth/AuthPages'), 'LoginPage') },
      { path: 'auth/signup', element: page(() => import('@/pages/auth/AuthPages'), 'SignupPage') },
      { path: 'auth/forgot-password', element: page(() => import('@/pages/auth/AuthPages'), 'ForgotPasswordPage') },
      { path: 'auth/reset-password', element: page(() => import('@/pages/auth/AuthPages'), 'ResetPasswordPage') },
      {
        path: 'dashboard',
        element: <RequireAuth>{page(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage')}</RequireAuth>,
      },
      { path: '*', element: page(() => import('@/pages/NotFoundPage'), 'NotFoundPage') },
    ],
  },
  {
    path: 'admin',
    errorElement: <RouteError />,
    element: <RequireAdmin>{page(() => import('@/components/layout/AdminLayout'), 'AdminLayout')}</RequireAdmin>,
    children: [
      { index: true, element: page(() => import('@/pages/admin/AdminDashboardPage'), 'AdminDashboardPage') },
      { path: 'colleges', element: page(() => import('@/pages/admin/CollegesAdminPage'), 'CollegesAdminPage') },
      { path: 'branches', element: page(() => import('@/pages/admin/BranchesAdminPage'), 'BranchesAdminPage') },
      { path: 'cutoffs', element: page(() => import('@/pages/admin/CutoffsAdminPage'), 'CutoffsAdminPage') },
      { path: 'seat-matrix', element: page(() => import('@/pages/admin/SeatMatrixAdminPage'), 'SeatMatrixAdminPage') },
      { path: 'fees-placements', element: page(() => import('@/pages/admin/FeesPlacementsAdminPage'), 'FeesPlacementsAdminPage') },
      { path: 'imports', element: page(() => import('@/pages/admin/ImportsAdminPage'), 'ImportsAdminPage') },
      { path: 'imports/:id', element: page(() => import('@/pages/admin/ImportReviewPage'), 'ImportReviewPage') },
      { path: 'sources', element: page(() => import('@/pages/admin/DataSourcesAdminPage'), 'DataSourcesAdminPage') },
      { path: 'monitoring', element: page(() => import('@/pages/admin/MonitoringAdminPage'), 'MonitoringAdminPage') },
      { path: 'notifications', element: page(() => import('@/pages/admin/NotificationsAdminPage'), 'NotificationsAdminPage') },
      { path: 'errors', element: page(() => import('@/pages/admin/ErrorLogsAdminPage'), 'ErrorLogsAdminPage') },
      { path: 'activity', element: page(() => import('@/pages/admin/ActivityLogAdminPage'), 'ActivityLogAdminPage') },
      { path: 'users', element: page(() => import('@/pages/admin/UsersAdminPage'), 'UsersAdminPage') },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
