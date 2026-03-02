import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/auth'
import MainLayout from './components/MainLayout'
import LoginPage from './pages/Login/LoginPage'
import Dashboard from './pages/Dashboard/Dashboard'
import CustomersPage from './pages/Customers/CustomersPage'
import GroupsPage from './pages/Groups/GroupsPage'
import AccountsPage from './pages/Accounts/AccountsPage'
import TransactionsPage from './pages/Transactions/TransactionsPage'
import TranslationsPage from './pages/Translations/TranslationsPage'
import NotificationsPage from './pages/Notifications/NotificationsPage'
import AdminPage from './pages/Admin/AdminPage'
import FollowUpsPage from './pages/FollowUps/FollowUpsPage'
import ActivityLogsPage from './pages/ActivityLogs/ActivityLogsPage'
import TodosPage from './pages/Todos/TodosPage'
import MarketingPage from './pages/Marketing/MarketingPage'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers/*" element={<CustomersPage />} />
          <Route path="followups" element={<FollowUpsPage />} />
          <Route path="groups/*" element={<GroupsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="todos" element={<TodosPage />} />
          <Route path="activity-logs" element={<ActivityLogsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="admin/*" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
