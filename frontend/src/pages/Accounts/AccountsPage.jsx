import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, Badge, message, Alert, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, WarningOutlined, CheckCircleOutlined, DeleteOutlined, SearchOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { accountApi } from '../../api'
import useAuthStore, { WA_ROLE_LABELS, WA_REGION_LABELS, ROLE_WEIGHT } from '../../store/auth'

const { Option } = Select

export default function AccountsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState([])
  const [expiring, setExpiring] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState({ open: false, account: null })
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [search, setSearch] = useState({})
  const [viewMode, setViewMode] = useState('mine')

  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  const load = (params = {}) => {
    setLoading(true)
    Promise.all([accountApi.list({ ...params, viewMode }), accountApi.expiring()])
      .then(([all, exp]) => { setAccounts(all); setExpiring(exp) })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(search) }, [search, viewMode])

  const handleCreate = async (vals) => {
    try {
      await accountApi.create({ ...vals, renewalDate: vals.renewalDate ? vals.renewalDate.toISOString() : null })
      message.success('账号已添加')
      setCreateModal(false)
      form.resetFields()
      load(search)
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const handleEdit = async (vals) => {
    try {
      await accountApi.update(editModal.account.id, {
        ...vals,
        renewalDate: vals.renewalDate ? vals.renewalDate.toISOString() : null,
        banTime: vals.banTime ? vals.banTime.toISOString() : null
      })
      message.success('账号已更新')
      setEditModal({ open: false, account: null })
      load(search)
    } catch (err) { message.error(err.message || '更新失败') }
  }

  const handleRenew = async (id) => {
    try {
      await accountApi.renew(id)
      message.success('已续费，到期日 +28 天')
      load(search)
    } catch (err) { message.error(err.message || '续费失败') }
  }

  const handleDelete = async (id) => {
    try {
      await accountApi.delete(id)
      message.success('账号已删除')
      load(search)
    } catch (err) { message.error(err.message || '删除失败') }
  }

  const openEdit = (account) => {
    editForm.setFieldsValue({
      phoneNumber: account.phoneNumber,
      nickname: account.nickname,
      role: account.role,
      region: account.region,
      renewalDate: account.renewalDate ? dayjs(account.renewalDate) : null,
      banTime: account.banTime ? dayjs(account.banTime) : null,
      banCount: account.banCount,
      isPermanentBan: account.isPermanentBan,
      isActive: account.isActive
    })
    setEditModal({ open: true, account })
  }

  const daysUntil = (date) => {
    if (!date) return null
    return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))
  }

  const columns = [
    { title: '账号/昵称', render: (_, r) => (
      <div>
        <div>{r.nickname || '-'}</div>
        <div style={{ fontSize: 12, color: '#999' }}>{r.phoneNumber}</div>
      </div>
    )},
    { title: '角色', dataIndex: 'role', render: v => <Tag color="blue">{WA_ROLE_LABELS[v] || v}</Tag> },
    { title: '地区', dataIndex: 'region', render: v => <Tag>{WA_REGION_LABELS[v] || v}</Tag> },
    { title: '负责人', dataIndex: 'user', render: u => u?.displayName || '-' },
    { title: '续费日期', dataIndex: 'renewalDate', render: v => {
      if (!v) return '-'
      const days = daysUntil(v)
      const color = days <= 7 ? 'red' : days <= 14 ? 'orange' : 'default'
      return <Tag color={color}>{dayjs(v).format('YYYY-MM-DD')} ({days}天后)</Tag>
    }},
    { title: '封号次数', dataIndex: 'banCount', render: (v, r) => (
      r.isPermanentBan ? <Tag color="red">永封</Tag> : v > 0 ? <Tag color="orange">{v}次</Tag> : <Tag color="green">正常</Tag>
    )},
    { title: '状态', dataIndex: 'isActive', render: v => v ? <Badge status="success" text="正常" /> : <Badge status="error" text="已停用" /> },
    { title: '操作', render: (_, r) => (
      <Space size="small">
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
        <Button size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} onClick={() => handleRenew(r.id)}>已续费</Button>
        <Popconfirm
          title="确认删除该账号？"
          description="有关联记录时无法删除，可改为停用。"
          onConfirm={() => handleDelete(r.id)}
          okText="删除" okButtonProps={{ danger: true }} cancelText="取消"
        >
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </Space>
    )}
  ]

  const AccountForm = ({ form, onFinish, showBanFields = false }) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item name="phoneNumber" label="手机号码" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="nickname" label="账号昵称"><Input /></Form.Item>
      <Form.Item name="role" label="账号角色" rules={[{ required: true }]}>
        <Select>{Object.entries(WA_ROLE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}</Select>
      </Form.Item>
      <Form.Item name="region" label="地区" rules={[{ required: true }]}>
        <Select>
          <Option value="DOMESTIC">国内</Option>
          <Option value="OVERSEAS">国外</Option>
        </Select>
      </Form.Item>
      <Form.Item name="renewalDate" label="续费日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
      {showBanFields && (
        <>
          <Form.Item name="banTime" label="最近封号时间"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="banCount" label="封号次数"><Input type="number" min={0} /></Form.Item>
          <Form.Item name="isPermanentBan" label="是否永封">
            <Select><Option value={false}>否</Option><Option value={true}>是（永久封号）</Option></Select>
          </Form.Item>
          <Form.Item name="isActive" label="账号状态">
            <Select><Option value={true}>正常使用</Option><Option value={false}>已停用</Option></Select>
          </Form.Item>
        </>
      )}
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">保存</Button>
          <Button onClick={() => { setCreateModal(false); setEditModal({ open: false, account: null }) }}>取消</Button>
        </Space>
      </Form.Item>
    </Form>
  )

  return (
    <div style={{ padding: 24 }}>
      {expiring.length > 0 && (
        <Alert
          message={`有 ${expiring.length} 个账号将在 3 天内到期，请及时续费`}
          type="warning" icon={<WarningOutlined />} showIcon style={{ marginBottom: 16 }} closable
        />
      )}

      {/* 视图切换 */}
      {canViewTeam && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <span style={{ color: '#666' }}>数据范围：</span>
            <Button.Group>
              <Button type={viewMode === 'mine' ? 'primary' : 'default'} icon={<UserOutlined />} onClick={() => setViewMode('mine')}>我的账号</Button>
              <Button type={viewMode === 'all' ? 'primary' : 'default'} icon={<TeamOutlined />} onClick={() => setViewMode('all')}>团队账号</Button>
            </Button.Group>
          </Space>
        </Card>
      )}

      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={v => setSearch(v)} onReset={() => setSearch({})}>
          <Form.Item name="keyword">
            <Input placeholder="手机号/昵称" prefix={<SearchOutlined />} allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="role">
            <Select placeholder="账号角色" allowClear style={{ width: 130 }}>
              {Object.entries(WA_ROLE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="region">
            <Select placeholder="地区" allowClear style={{ width: 100 }}>
              <Option value="DOMESTIC">国内</Option>
              <Option value="OVERSEAS">国外</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">搜索</Button>
              <Button htmlType="reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="WhatsApp 账号管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>添加账号</Button>}
      >
        <Table columns={columns} dataSource={accounts} rowKey="id" loading={loading} />
      </Card>

      <Modal title="添加 WhatsApp 账号" open={createModal} onCancel={() => setCreateModal(false)} footer={null}>
        <AccountForm form={form} onFinish={handleCreate} showBanFields={false} />
      </Modal>

      <Modal title="编辑账号" open={editModal.open} onCancel={() => setEditModal({ open: false, account: null })} footer={null}>
        <AccountForm form={editForm} onFinish={handleEdit} showBanFields={true} />
      </Modal>
    </div>
  )
}
