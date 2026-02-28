import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,

  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  }
}))

// 角色权重
export const ROLE_WEIGHT = {
  MEMBER: 1,
  TRANSLATOR: 1,
  TEAM_LEADER: 2,
  SUPERVISOR: 3,
  DEPT_MANAGER: 4,
  ADMIN: 5,
  SUPER_ADMIN: 6
}

// 角色中文名
export const ROLE_LABELS = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  DEPT_MANAGER: '部门经理',
  SUPERVISOR: '主管',
  TEAM_LEADER: '组长',
  MEMBER: '组员',
  TRANSLATOR: '翻译'
}

// WA 账号角色
export const WA_ROLE_LABELS = {
  PROFESSOR: '教授',
  BIG_ASSISTANT: '大助理',
  SMALL_ASSISTANT: '小助理',
  WATER_ARMY: '水军',
  PLATFORM_TECH: '平台技术'
}

export const WA_REGION_LABELS = {
  DOMESTIC: '国内',
  OVERSEAS: '国外'
}

export const CONTACT_TYPE_LABELS = {
  TEXT: '文字沟通',
  CALL: '电话通话',
  VIDEO: '视频通话'
}

export const CURRENCY_LABELS = {
  BTC: 'BTC (比特币)',
  ETH: 'ETH (以太坊)',
  USDT: 'USDT',
  USDC: 'USDC'
}

export default useAuthStore
