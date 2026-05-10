import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import GisRoute from '@/routers/protectedRoute/gisRoute';
import ProtectedRoute from '@/routers/protectedRoute';

// Lazy imports
const AppLayout = lazy(() => import('@/layouts/AppLayout'));
const NotFound = lazy(() => import('@/common/components/partials/404'));
const Forbidden403 = lazy(() => import('@/common/components/partials/403'));

const Auth = lazy(() => import('@/modules/auth/pages'));
const Login = lazy(() => import('@/modules/auth/pages/login'));

const Dashboard = lazy(() => import('@/modules/dashboard/pages'));
const DashboardLists = lazy(() => import('@/modules/dashboard/pages/dashboardLists'));

const Users = lazy(() => import('@/modules/users/pages'));
const UserLists = lazy(() => import('@/modules/users/pages/userLists'));

const Settings = lazy(() => import('@/modules/settings/pages'));
const ProfileSettings = lazy(() => import('@/modules/settings/pages/profile'));

const TenantUsersList = lazy(() => import('@/modules/users/pages/tenantLists'));

const GisMap = lazy(() => import('@/modules/gis/pages/gisMap'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/gis" replace /> },
      {
        path: '/dashboard',
        element: <Dashboard />,
        children: [{ path: '', element: <DashboardLists /> }],
      },
      {
        path: '/users',
        element: <Users />,
        children: [
          { path: '', element: <TenantUsersList /> },
          { path: ':id', element: <UserLists /> },
        ],
      },
      {
        path: '/settings',
        element: <Settings />,
        children: [{ path: '', element: <ProfileSettings /> }],
      },
      // 403 & 404
      { path: '/403', element: <Forbidden403 /> },
      { path: '/*', element: <NotFound /> },
    ],
  },
  {
    path: '/auth',
    element: <Auth />,
    children: [
      { path: 'signin', element: <Login /> },
      // { path: 'create-account', element: <Register /> },
    ],
  },
  {
    path: '/gis',
    element: (
      <GisRoute>
        <GisMap />
      </GisRoute>
    ),
  },
]);
