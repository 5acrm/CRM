import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// 自动带上 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 自动跳登录页
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err.response?.data || err)
  }
)

// 认证
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/password', data)
}

// 用户
export const userApi = {
  list: () => api.get('/users'),
  subordinates: () => api.get('/users/subordinates'),
  translators: () => api.get('/users/translators'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  departments: () => api.get('/users/departments'),
  createDepartment: (data) => api.post('/users/departments', data),
  deleteDepartment: (id) => api.delete(`/users/departments/${id}`)
}

// 客户
export const customerApi = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  moveGroup: (id, data) => api.put(`/customers/${id}/move-group`, data),
  updateWallets: (id, data) => api.put(`/customers/${id}/wallets`, data),
  updateFollowers: (id, data) => api.put(`/customers/${id}/followers`, data),
  financeSummary: (id) => api.get(`/customers/${id}/finance-summary`)
}

// 群组
export const groupApi = {
  list: (params) => api.get('/groups', { params }),
  create: (data) => api.post('/groups', data),
  update: (id, data) => api.put(`/groups/${id}`, data),
  merge: (id, data) => api.post(`/groups/${id}/merge`, data),
  stats: (id, params) => api.get(`/groups/${id}/stats`, { params }),
  addStats: (id, data) => api.post(`/groups/${id}/stats`, data),
  summary: (id, params) => api.get(`/groups/${id}/summary`, { params })
}

// WhatsApp 账号
export const accountApi = {
  list: (params) => api.get('/accounts', { params }),
  mine: () => api.get('/accounts/mine'),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.put(`/accounts/${id}`, data),
  renew: (id) => api.post(`/accounts/${id}/renew`),
  delete: (id) => api.delete(`/accounts/${id}`),
  expiring: () => api.get('/accounts/expiring')
}

// 跟进记录
export const followUpApi = {
  listAll: (params) => api.get('/followups', { params }),
  listByCustomer: (customerId) => api.get(`/followups/customer/${customerId}`),
  create: (data) => api.post('/followups', data),
  addComment: (recordId, data) => api.post(`/followups/${recordId}/comments`, data),
  addResponse: (commentId, data) => api.post(`/followups/comments/${commentId}/responses`, data)
}

// 财务
export const transactionApi = {
  list: (params) => api.get('/transactions', { params }),
  create: (data) => api.post('/transactions', data),
  stats: (params) => api.get('/transactions/stats', { params }),
  rates: () => api.get('/transactions/rates')
}

// 翻译
export const translationApi = {
  list: (params) => api.get('/translations', { params }),
  create: (data) => api.post('/translations', data),
  complete: (id, data) => api.put(`/translations/${id}/complete`, data),
  push: (data) => api.post('/translations/push', data),
  searchCustomer: (phone) => api.get('/translations/search-customer', { params: { phone } })
}

// 通知
export const notificationApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all')
}

export default api
