import React, { useState, useEffect } from 'react'
import { Table, Button, Input, Select, Space, Tag, Card, Form, message, DatePicker, Modal, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { activityLogApi, userApi } from '../../api'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'

const { Option } = Select
const { RangePicker } = DatePicker
const { Text } = Typography

const ACTION_LABELS = { CREATE: '创建', UPDATE: '修改', DELETE: '删除', PASSWORD_CHANGE: '改密码' }
const ACTION_COLORS = { CREATE: 'green', UPDATE: 'blue', DELETE: 'red', PASSWORD_CHANGE: 'orange' }
const TARGET_LABELS = { GROUP: '群组', CUSTOMER: '客户', USER: '用户' }
const TARGET_COLORS = { GROUP: 'cyan', CUSTOMER: 'purple', USER: 'gold' }

export default function ActivityLogsPage() {
  const { user } = useAuthStore()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [subordinates, setSubordinates] = useState([])
  const [search, setSearch] = useState({})
  const [page, setPage] = useState(1)
  const [detailModal, setDetailModal] = useState({ open: false, details: null })

  const canView = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  useEffect(() => {
    if (canView) userApi.subordinates().then(setSubordinates).catch(() => {})
  }, [])

  const fetchData = (params = {}) => {
    setLoading(true)
    activityLogApi.list({ page, pageSize: 20, ...search, ...params })
      .then(setData)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (canView) fetchData() }, [page, search])

  const handleSearch = (vals) => {
    const params = {}
    if (vals.action) params.action = vals.action
    if (vals.targetType) params.targetType = vals.targetType
    if (vals.keyword) params.keyword = vals.keyword
    if (vals.userId) params.userId = vals.userId
    if (vals.dateRange && vals.dateRange.length === 2) {
      params.startDate = vals.dateRange[0].format('YYYY-MM-DD')
      params.endDate = vals.dateRange[1].format('YYYY-MM-DD')
    }
    setSearch(params)
    setPage(1)
  }

  const handleReset = () => {
    setSearch({})
    setPage(1)
  }

  const showDetails = (details) => {
    try {
      const parsed = typeof details === 'string' ? JSON.parse(details) : details
      setDetailModal({ open: true, details: parsed })
    } catch {
      setDetailModal({ open: true, details: details })
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作人',
      dataIndex: 'user',
      width: 100,
      render: (u) => u?.displayName || u?.username || '-'
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 90,
      render: (action) => (
        <Tag color={ACTION_COLORS[action] || 'default'}>
          {ACTION_LABELS[action] || action}
        </Tag>
      )
    },
    {
      title: '对象类型',
      dataIndex: 'targetType',
      width: 80,
      render: (type) => (
        <Tag color={TARGET_COLORS[type] || 'default'}>
          {TARGET_LABELS[type] || type}
        </Tag>
      )
    },
    {
      title: '对象名称',
      dataIndex: 'targetName',
      width: 160,
      render: (name) => name || '-'
    },
    {
      title: '详情',
      dataIndex: 'details',
      render: (details) => details ? (
        <Button type="link" size="small" onClick={() => showDetails(details)}>查看</Button>
      ) : <Text type="secondary">-</Text>
    }
  ]

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <Card><Text type="secondary">权限不足，无法查看操作日志</Text></Card>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={handleSearch} onReset={handleReset}>
          <Form.Item name="action">
            <Select placeholder="操作类型" allowClear style={{ width: 110 }}>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="targetType">
            <Select placeholder="对象类型" allowClear style={{ width: 100 }}>
              {Object.entries(TARGET_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="keyword">
            <Input placeholder="对象名称" prefix={<SearchOutlined />} allowClear style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="dateRange">
            <RangePicker style={{ width: 240 }} />
          </Form.Item>
          {subordinates.length > 0 && (
            <Form.Item name="userId">
              <Select placeholder="操作人" allowClear style={{ width: 120 }} showSearch
                filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
                {subordinates.map(u => <Option key={u.id} value={u.id}>{u.displayName || u.username}</Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">搜索</Button>
              <Button htmlType="reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title={`操作日志（共 ${data.total} 条）`}>
        <Table
          columns={columns}
          dataSource={data.data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize: 20,
            total: data.total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`
          }}
        />
      </Card>

      <Modal
        title="变更详情"
        open={detailModal.open}
        onCancel={() => setDetailModal({ open: false, details: null })}
        footer={null}
        width={600}
      >
        <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 16, borderRadius: 6, fontSize: 13 }}>
          {detailModal.details ? JSON.stringify(detailModal.details, null, 2) : '无详情'}
        </pre>
      </Modal>
    </div>
  )
}
