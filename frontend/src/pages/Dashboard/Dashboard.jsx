import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Table, Tag, Space, Typography, message, Button } from 'antd'
import { TeamOutlined, AppstoreOutlined, WarningOutlined, UserOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { transactionApi, groupApi, accountApi, customerApi } from '../../api'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'

const { Title, Text } = Typography

export default function Dashboard() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [groups, setGroups] = useState([])
  const [expiring, setExpiring] = useState([])
  const [customerCount, setCustomerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('mine')

  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  const load = (mode) => {
    const vm = mode || viewMode
    setLoading(true)
    Promise.all([
      transactionApi.stats({ viewMode: vm }),
      groupApi.list({ viewMode: vm }),
      accountApi.expiring(),
      customerApi.list({ pageSize: 1, viewMode: vm })
    ]).then(([s, g, exp, c]) => {
      setStats(s)
      setGroups(g.slice(0, 5))
      setExpiring(exp.slice(0, 5))
      setCustomerCount(c.total || 0)
    }).catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    load(mode)
  }

  const expiringColumns = [
    { title: '账号', render: (_, r) => r.nickname || r.phoneNumber },
    { title: '到期日', dataIndex: 'renewalDate', render: v => dayjs(v).format('YYYY-MM-DD') },
    { title: '天数', render: (_, r) => {
      const days = Math.ceil((new Date(r.renewalDate) - new Date()) / (1000 * 60 * 60 * 24))
      return <Tag color={days <= 7 ? 'red' : 'orange'}>{days}天</Tag>
    }}
  ]

  const groupColumns = [
    { title: '群组名称', dataIndex: 'name' },
    { title: '负责人', dataIndex: 'user', render: u => u?.displayName || '-' },
    { title: '客户数', dataIndex: '_count', render: c => c?.customers || 0 },
    { title: '成本', dataIndex: 'cost', render: v => `$${v?.toFixed(0)}` }
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          欢迎回来，{user.displayName || user.username}
        </Title>
        {canViewTeam && (
          <Button.Group>
            <Button
              type={viewMode === 'mine' ? 'primary' : 'default'}
              icon={<UserOutlined />}
              onClick={() => handleViewModeChange('mine')}
            >个人数据</Button>
            <Button
              type={viewMode === 'all' ? 'primary' : 'default'}
              icon={<TeamOutlined />}
              onClick={() => handleViewModeChange('all')}
            >团队数据</Button>
          </Button.Group>
        )}
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="客户总数"
              value={customerCount}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="总入金 (USD)"
              value={stats?.totalDepositUsd || 0}
              prefix="$"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="总出金 (USD)"
              value={stats?.totalWithdrawalUsd || 0}
              prefix="$"
              precision={2}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="净额 (USD)"
              value={stats?.netUsd || 0}
              prefix="$"
              precision={2}
              valueStyle={{ color: (stats?.netUsd || 0) >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 群组概览 */}
        <Col span={14}>
          <Card title={<Space><AppstoreOutlined />群组概览</Space>} loading={loading}>
            <Table columns={groupColumns} dataSource={groups} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>

        {/* 即将到期账号 */}
        <Col span={10}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#fa8c16' }} />
                即将到期账号
                {expiring.length > 0 && <Tag color="orange">{expiring.length}</Tag>}
              </Space>
            }
            loading={loading}
          >
            {expiring.length === 0 ? (
              <Text type="secondary">暂无即将到期的账号</Text>
            ) : (
              <Table columns={expiringColumns} dataSource={expiring} rowKey="id" pagination={false} size="small" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
