import React, { useState, useEffect, useMemo } from 'react'
import { Table, Button, Input, Select, Space, Tag, Card, Row, Col, Modal, Form, message, Popconfirm, Badge, Popover } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, UserOutlined, TeamOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { customerApi, groupApi, userApi, accountApi } from '../../api'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'
import US_STATES, { TIMEZONE_LABELS } from '../../data/usStates'

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
  const [selectedState, setSelectedState] = useState(null)

  const canDelete = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']
  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']
  const canFilterGroup = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']

  // 提取可用小组编号
  const groupNumbers = useMemo(() => {
    const nums = [...new Set(subordinates.filter(u => u.groupNumber).map(u => u.groupNumber))].sort((a, b) => a - b)
    return nums
  }, [subordinates])

  // 获取选中州的城市列表
  const citiesForState = useMemo(() => {
    if (!selectedState) return []
    const state = US_STATES.find(s => s.code === selectedState)
    return state ? state.cities : []
  }, [selectedState])

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
      // 自动填充时区
      if (vals.usState && !vals.timezone) {
        const state = US_STATES.find(s => s.code === vals.usState)
        if (state) vals.timezone = state.timezone
      }
      await customerApi.create(vals)
      message.success('客户创建成功')
      setModalOpen(false); form.resetFields(); setSelectedState(null); fetchData()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const handleDelete = async (id) => {
    try {
      await customerApi.delete(id)
      message.success('客户已删除'); fetchData()
    } catch (err) { message.error(err.message || '删除失败') }
  }

  const toggleStar = async (id, starred) => {
    try {
      await customerApi.update(id, { isStarred: starred });
      fetchData();
    } catch (err) { message.error('操作失败'); }
  };

  const columns = [
    {
      title: '',
      dataIndex: 'isStarred',
      width: 36,
      render: (starred, r) => starred
        ? <StarFilled style={{ color: '#faad14', cursor: 'pointer', fontSize: 16 }} onClick={(e) => { e.stopPropagation(); toggleStar(r.id, false); }} />
        : <StarOutlined style={{ color: '#d9d9d9', cursor: 'pointer', fontSize: 16 }} onClick={(e) => { e.stopPropagation(); toggleStar(r.id, true); }} />
    },
    { title: 'UID', dataIndex: 'uid', width: 70, render: v => v || '-' },
    { title: '客户名称', dataIndex: 'name', width: 100, render: (name, r) => <a onClick={() => navigate('/customers/' + r.id)}>{name}</a> },
    { title: '电话', dataIndex: 'phone', width: 100, render: v => v || '-' },
    { title: '所在群组', dataIndex: 'currentGroup', width: 100, render: g => g ? <Tag color="blue">{g.name}</Tag> : '-' },
    { title: '跟进状态', dataIndex: 'followUpStatus', width: 80, render: v => v ? <Tag>{v}</Tag> : '-' },
    {
      title: 'WA账号',
      dataIndex: 'waAccountLinks',
      width: 130,
      render: links => links?.length > 0
        ? <Space direction="vertical" size={2}>
            {links.map(l => {
              const a = l.waAccount
              return <Tag key={l.waAccountId} color="cyan">{a?.nickname ? `${a.nickname} ${a.phoneNumber}` : a?.phoneNumber}</Tag>
            })}
          </Space>
        : '-'
    },
    {
      title: '跟进记录',
      dataIndex: 'followUpRecords',
      width: 200,
      render: (records) => {
        const latest = records?.[0]
        if (!latest) return <span style={{ color: '#999' }}>-</span>
        return (
          <Popover content={<div style={{ maxWidth: 350, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{latest.content}</div>} trigger="hover" placement="topLeft">
            <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666', cursor: 'pointer' }}>{latest.content}</div>
          </Popover>
        )
      }
    },
    { title: '注册', dataIndex: 'isRegistered', width: 50, render: v => v ? <Badge status="success" text="是" /> : <Badge status="default" text="否" /> },
    { title: '实名', dataIndex: 'isRealName', width: 50, render: v => v ? <Badge status="success" text="是" /> : <Badge status="default" text="否" /> },
    { title: '入金(USD)', dataIndex: 'totalDepositUsd', width: 90, render: v => v > 0 ? <span style={{ color: '#3f8600', fontWeight: 600 }}>{'$' + v.toFixed(0)}</span> : '-' },
    { title: '负责人', dataIndex: 'createdBy', width: 70, render: u => u ? u.displayName : '-' },
    { title: '操作', width: 120, fixed: 'right', render: (_, r) => (
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
          {viewMode === 'all' && canFilterGroup && groupNumbers.length > 0 && (
            <Form.Item name="groupNumber">
              <Select placeholder="小组" allowClear style={{ width: 90 }}>
                {groupNumbers.map(n => <Option key={n} value={n}>{n}组</Option>)}
              </Select>
            </Form.Item>
          )}
          {canViewTeam && subordinates.length > 0 && (
            <Form.Item name="assignedUserId">
              <Select placeholder="负责人" allowClear style={{ width: 120 }}>
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
          scroll={{ x: 1200 }}
          pagination={{ current: page, pageSize: 15, total: data.total, onChange: setPage, showSizeChanger: false }} />
      </Card>

      <Modal title="新增客户" open={modalOpen} onCancel={() => { setModalOpen(false); setSelectedState(null) }} footer={null} width={650}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="电话号码（必填）" rules={[{ required: true, message: '请填写电话号码' }, { pattern: /^\d+$/, message: '电话号码只能包含数字' }]}>
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
              <Form.Item name="usState" label="美国州">
                <Select
                  placeholder="选择州"
                  allowClear
                  showSearch
                  filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}
                  onChange={(val) => {
                    setSelectedState(val)
                    form.setFieldsValue({ usCity: undefined, timezone: undefined })
                    if (val) {
                      const state = US_STATES.find(s => s.code === val)
                      if (state) form.setFieldsValue({ timezone: state.timezone })
                    }
                  }}
                >
                  {US_STATES.map(s => <Option key={s.code} value={s.code}>{s.name} ({s.code})</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="usCity" label="城市">
                <Select placeholder="选择城市" allowClear showSearch
                  filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}
                >
                  {citiesForState.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="timezone" label="时区">
                <Select placeholder="自动生成" allowClear disabled>
                  {Object.entries(TIMEZONE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
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
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="客户备注信息" maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => { setModalOpen(false); setSelectedState(null) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
