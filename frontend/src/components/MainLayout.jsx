import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge, Avatar, Dropdown, Space, Typography, message } from 'antd'
import {
  DashboardOutlined, TeamOutlined, AppstoreOutlined, MobileOutlined,
  TransactionOutlined, TranslationOutlined, BellOutlined, SettingOutlined,
  LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ProfileOutlined,
  FileSearchOutlined, BulbOutlined, CheckSquareOutlined
} from '@ant-design/icons'
import { io } from 'socket.io-client'
import useAuthStore, { ROLE_LABELS, ROLE_WEIGHT } from '../store/auth'
import { notificationApi } from '../api'

const { Sider, Header, Content } = Layout
const { Text } = Typography

const socket = io('/', { autoConnect: false })

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // 连接 socket 并注册用户
    socket.connect()
    socket.emit('register', user.id)

    socket.on('notification', () => {
      setUnreadCount(c => c + 1)
      message.info('你有新的通知')
    })

    // 加载未读数
    const refreshUnread = () => {
      notificationApi.list({ isRead: false, pageSize: 1 })
        .then(res => setUnreadCount(res.unreadCount || 0))
        .catch(() => {})
    }
    refreshUnread()

    // 监听通知页面的已读/删除事件，实时更新红色提醒
    window.addEventListener('notification-updated', refreshUnread)

    return () => {
      socket.disconnect()
      window.removeEventListener('notification-updated', refreshUnread)
    }
  }, [user.id])

  const canAdmin = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '数据总览' },
    { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
    { key: '/followups', icon: <ProfileOutlined />, label: '跟进记录' },
    { key: '/groups', icon: <AppstoreOutlined />, label: '群组管理' },
    { key: '/accounts', icon: <MobileOutlined />, label: 'WhatsApp账号' },
    { key: '/transactions', icon: <TransactionOutlined />, label: '财务记录' },
    { key: '/translations', icon: <TranslationOutlined />, label: '翻译服务' },
    { key: '/notifications', icon: <BellOutlined />, label: (
      <span>通知中心 {unreadCount > 0 && <Badge count={unreadCount} size="small" offset={[4, 0]} />}</span>
    )},
    { key: '/todos', icon: <CheckSquareOutlined />, label: '待办事项' },
    { key: '/marketing', icon: <BulbOutlined />, label: '营销智库' },
    ...(user.role === 'SUPER_ADMIN' ? [{ key: '/activity-logs', icon: <FileSearchOutlined />, label: '操作日志' }] : []),
    ...(canAdmin ? [{ key: '/admin', icon: <SettingOutlined />, label: '系统管理' }] : [])
  ]

  const selectedKey = '/' + location.pathname.split('/')[1]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }
    ],
    onClick: ({ key }) => { if (key === 'logout') handleLogout() }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={200}
        trigger={null}
      >
        <div style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Text strong style={{ color: '#fff', fontSize: collapsed ? 12 : 16 }}>
            {collapsed ? 'CRM' : '客户管理系统'}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <span style={{ cursor: 'pointer', fontSize: 18 }} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
              <span>{user.displayName || user.username}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>{ROLE_LABELS[user.role]}</Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ overflow: 'auto', background: '#f0f2f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
