import React, { useState, useEffect } from 'react'
import { Table, Button, Input, Select, Space, Tag, Card, Row, Col, Modal, Form, message, Popconfirm, Badge } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { customerApi, groupApi, userApi, accountApi } from '../../api'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'

const { Option } = Select

const FOLLOW_UP_STATUS_OPTIONS = ['初次接触', '有意向', '深度跟进', '报价阶段', '已成交', '暂时搁置', '已流失']

export default function CustomerList() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState([])
  const [subordinates, setSubordinates] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [search, setSearch] = useState({})
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState('mine')
  const [myAccounts, setMyAccounts] = useState([])

  const canDelete = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']
  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  useEffect(() => {
    groupApi.list({ viewMode: 'all' }).then(setGroups).catch(() => {})
    if (canViewTeam) userApi.subordinates().then(setSubordinates).catch(() => {})
    accountApi.mine().then(setMyAccounts).catch(() => {})
  }, [])

  const fetchData = (params = {}) => {
    setLoading(true)
    customerApi.list({ page, pageSize: 15, viewMode, ...search, ...params })
      .then(setData)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [page, search, viewMode])

  const handleSearch = (vals) => { setSearch(vals); setPage(1) }

  const handleCreate = async (vals) => {
    try {
      await customerApi.create(vals)
      message.success('客户创建成功')
      setModalOpen(false); form.resetFields(); fetchData()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const handleDelete = async (id) => {
    try {
      await customerApi.delete(id)
      message.success('客户已删除'); fetchData()
    } catch (err) { message.error(err.message || '删除失败') }
  }

  const columns = [
    { title: 'UID', dataIndex: 'uid', width: 80, render: v => v || '-' },
    { title: '客户名称', dataIndex: 'name', render: (name, r) => <a onClick={() => navigate('/customers/' + r.id)}>{name}</a> },
    { title: '电话', dataIndex: 'phone', render: v => v || '-' },
    { title: '所在群组', dataIndex: 'currentGroup', render: g => g ? <Tag color="blue">{g.name}</Tag> : '-' },
    { title: '跟进状态', dataIndex: 'followUpStatus', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'WA账号', dataIndex: 'waAccountLinks', render: links => links?.length > 0
        ? <Space size={2} wrap>{links.map(l => {
            const a = l.waAccount
            return <Tag key={l.waAccountId} color="cyan">{a?.nickname ? `${a.nickname} ${a.phoneNumber}` : a?.phoneNumber}</Tag>
          })}</Space>
        : '-' },
    { title: '注册', dataIndex: 'isRegistered', width: 60, render: v => v ? <Badge status="success" text="是" /> : <Badge status="default" text="否" /> },
    { title: '实名', dataIndex: 'isRealName', width: 60, render: v => v ? <Badge status="success" text="是" /> : <Badge status="default" text="否" /> },
    { title: '授权矿池', dataIndex: 'hasMiningAuth', width: 80, render: v => v ? <Tag color="gold">已授权</Tag> : '-' },
    { title: '入金(USD)', dataIndex: 'totalDepositUsd', render: v => v > 0 ? <span style={{ color: '#3f8600', fontWeight: 600 }}>{'$' + v.toFixed(0)}</span> : '-' },
    { title: '负责人', dataIndex: 'createdBy', render: u => u ? u.displayName : '-' },
    { title: '操作', render: (_, r) => (
      <Space size="small">
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate('/customers/' + r.id)}>详情</Button>
        {canDelete && (
          <Popconfirm
            title="确认删除该客户？"
            description="删除后跟进记录、财务记录将一并删除，不可恢复！"
            onConfirm={() => handleDelete(r.id)}
            okText="删除" okButtonProps={{ danger: true }} cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        )}
      </Space>
    )}
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* 视图切换 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <span style={{ color: '#666' }}>数据范围：</span>
          <Button.Group>
            <Button
              type={viewMode === 'mine' ? 'primary' : 'default'}
              icon={<UserOutlined />}
              onClick={() => { setViewMode('mine'); setPage(1) }}
            >我的客户</Button>
            {canViewTeam && (
              <Button
                type={viewMode === 'all' ? 'primary' : 'default'}
                icon={<TeamOutlined />}
                onClick={() => { setViewMode('all'); setPage(1) }}
              >团队客户</Button>
            )}
          </Button.Group>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={handleSearch} onReset={() => { setSearch({}); setPage(1) }}>
          <Form.Item name="keyword"><Input placeholder="姓名/电话/邮箱" prefix={<SearchOutlined />} allowClear style={{ width: 160 }} /></Form.Item>
          <Form.Item name="uid"><Input placeholder="UID" allowClear style={{ width: 100 }} /></Form.Item>
          <Form.Item name="groupId">
            <Select placeholder="所在群组" allowClear style={{ width: 140 }}>
              {groups.map(g => <Option key={g.id} value={g.id}>{g.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="followUpStatus">
            <Select placeholder="跟进状态" allowClear style={{ width: 120 }}>
              {FOLLOW_UP_STATUS_OPTIONS.map(s => <Option key={s} value={s}>{s}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="hasDeposit">
            <Select placeholder="入金状态" allowClear style={{ width: 100 }}>
              <Option value="true">有入金</Option>
              <Option value="false">无入金</Option>
            </Select>
          </Form.Item>
          {canViewTeam && subordinates.length > 0 && (
            <Form.Item name="assignedUserId">
              <Select placeholder="负责业务员" allowClear style={{ width: 120 }}>
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

      <Card
        title={`客户列表（共 ${data.total} 人）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增客户</Button>}
      >
        <Table columns={columns} dataSource={data.data} rowKey="id" loading={loading}
          pagination={{ current: page, pageSize: 15, total: data.total, onChange: setPage, showSizeChanger: false }} />
      </Card>

      <Modal title="新增客户" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="电话号码（必填）" rules={[{ required: true, message: '请填写电话号码' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="客户名称（留空则使用电话）">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currentGroupId" label="所在群组" rules={[{ required: true, message: '请选择群组' }]}>
                <Select placeholder="选择群组">
                  {groups.map(g => <Option key={g.id} value={g.id}>{g.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="followUpStatus" label="跟进状态" rules={[{ required: true, message: '请选择跟进状态' }]}>
                <Select placeholder="选择状态">
                  {FOLLOW_UP_STATUS_OPTIONS.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="uid" label="UID"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="邮箱"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="hasMiningAuth" label="授权矿池" initialValue={false}>
                <Select><Option value={false}>否</Option><Option value={true}>是</Option></Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isRegistered" label="是否注册" initialValue={false}>
                <Select><Option value={false}>否</Option><Option value={true}>是</Option></Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isRealName" label="是否实名" initialValue={false}>
                <Select><Option value={false}>否</Option><Option value={true}>是</Option></Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="waAccountIds" label="关联WhatsApp账号">
                <Select mode="multiple" placeholder="选择关联账号（可多选）" allowClear>
                  {myAccounts.map(a => <Option key={a.id} value={a.id}>{a.nickname ? `${a.nickname} ${a.phoneNumber}` : a.phoneNumber}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
