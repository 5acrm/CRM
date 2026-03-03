import React, { useState, useEffect } from 'react'
import { Table, Button, Input, Select, Space, Tag, Card, Form, message, Typography, Badge, Tooltip, Popover } from 'antd'
import { SearchOutlined, MessageOutlined, PhoneOutlined, VideoCameraOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { followUpApi, userApi } from '../../api'
import useAuthStore, { WA_ROLE_LABELS, CONTACT_TYPE_LABELS, ROLE_WEIGHT } from '../../store/auth'

const { Text } = Typography
const { Option } = Select

export default function FollowUpsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [data, setData] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [subordinates, setSubordinates] = useState([])
  const [search, setSearch] = useState({})
  const [page, setPage] = useState(1)
  const [editModal, setEditModal] = useState({ open: false, record: null })
  const [editForm] = Form.useForm()

  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  useEffect(() => {
    if (canViewTeam) userApi.subordinates().then(setSubordinates).catch(() => {})
  }, [])

  const fetchData = (params = {}) => {
    setLoading(true)
    followUpApi.listAll({ page, pageSize: 20, ...search, ...params })
      .then(setData)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [page, search])

  const handleSearch = (vals) => { setSearch(vals); setPage(1) }

  const openEdit = (record) => {
    setEditModal({ open: true, record })
    editForm.setFieldsValue({ content: record.content, contactType: record.contactType })
  }

  const handleEdit = async (vals) => {
    try {
      await followUpApi.update(editModal.record.id, vals)
      message.success('修改成功')
      setEditModal({ open: false, record: null })
      editForm.resetFields()
      fetchData()
    } catch (err) { message.error(err.message || '修改失败') }
  }

  const contactTypeIcon = (type) => {
    if (type === 'CALL') return <PhoneOutlined style={{ color: '#52c41a' }} />
    if (type === 'VIDEO') return <VideoCameraOutlined style={{ color: '#1677ff' }} />
    return <MessageOutlined style={{ color: '#8c8c8c' }} />
  }

  const expandedRowRender = (record) => (
    <div style={{ padding: '8px 24px 12px' }}>
      <div style={{ background: '#fafafa', padding: '10px 14px', borderRadius: 6, marginBottom: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        <Text>{record.content}</Text>
      </div>
      {record.comments?.length > 0 ? record.comments.map(comment => (
        <div key={comment.id} style={{ marginBottom: 8 }}>
          <div style={{ padding: '6px 10px', background: '#fff7e6', borderRadius: 4, borderLeft: '3px solid #fa8c16' }}>
            <Text strong style={{ fontSize: 12, color: '#fa8c16' }}>{comment.user?.displayName} 的建议：</Text>
            <div>{comment.content}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(comment.createdAt).format('MM-DD HH:mm')}</Text>
          </div>
          {comment.responses?.map(r => (
            <div key={r.id} style={{ marginLeft: 16, padding: '4px 8px', background: '#f6ffed', borderRadius: 4, marginTop: 4, borderLeft: '3px solid #52c41a' }}>
              <Text strong style={{ fontSize: 12 }}>{r.user?.displayName} 回应：</Text>
              <span> {r.content}</span>
            </div>
          ))}
        </div>
      )) : (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无建议</Text>
      )}
    </div>
  )

  const columns = [
    {
      title: '客户',
      dataIndex: 'customer',
      width: 150,
      render: (c) => c ? (
        <div>
          <a onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`) }}
            style={{ fontWeight: 600 }}>{c.name}</a>
          <div>{c.phone && <Text type="secondary" style={{ fontSize: 11 }}>{c.phone}</Text>}</div>
          {c.followUpStatus && <Tag style={{ fontSize: 11, marginTop: 2 }}>{c.followUpStatus}</Tag>}
        </div>
      ) : '-'
    },
    {
      title: '所在群组',
      dataIndex: 'customer',
      width: 110,
      render: (c) => c?.currentGroup ? <Tag color="blue">{c.currentGroup.name}</Tag> : '-'
    },
    {
      title: '联系方式',
      dataIndex: 'contactType',
      width: 90,
      render: (type) => (
        <Space size={4}>
          {contactTypeIcon(type)}
          <span style={{ fontSize: 12 }}>{CONTACT_TYPE_LABELS[type]}</span>
        </Space>
      )
    },
    {
      title: '跟进内容',
      dataIndex: 'content',
      width: 280,
      render: (text) => (
        <Popover content={<div style={{ maxWidth: 400, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</div>} trigger="hover" placement="topLeft">
          <div style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{text}</div>
        </Popover>
      )
    },
    {
      title: '使用账号',
      dataIndex: 'waAccount',
      width: 150,
      render: (a, r) => a ? (
        <div>
          <div style={{ fontSize: 12 }}>{a.nickname ? `${a.nickname} ${a.phoneNumber}` : a.phoneNumber}</div>
          {r.waRole && <Tag color="purple" style={{ fontSize: 11 }}>{WA_ROLE_LABELS[r.waRole]}</Tag>}
        </div>
      ) : '-'
    },
    {
      title: '跟进人',
      dataIndex: 'user',
      width: 90,
      render: (u) => u?.displayName || '-'
    },
    {
      title: '建议',
      dataIndex: 'comments',
      width: 60,
      align: 'center',
      render: (comments) => comments?.length > 0
        ? <Badge count={comments.length} color="orange" />
        : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 100,
      render: (v) => dayjs(v).format('MM-DD HH:mm')
    },
    {
      title: '操作',
      width: 60,
      fixed: 'right',
      render: (_, r) => (r.userId === user.id || ['SUPER_ADMIN', 'ADMIN'].includes(user.role))
        ? <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(r) }}>改</Button>
        : null
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={handleSearch} onReset={() => { setSearch({}); setPage(1) }}>
          <Form.Item name="keyword">
            <Input placeholder="客户姓名/电话" prefix={<SearchOutlined />} allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="contactType">
            <Select placeholder="联系方式" allowClear style={{ width: 110 }}>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          {canViewTeam && subordinates.length > 0 && (
            <Form.Item name="userId">
              <Select placeholder="跟进人" allowClear style={{ width: 120 }} showSearch
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

      <Card title={`跟进记录（共 ${data.total} 条）`}>
        <Table
          columns={columns}
          dataSource={data.data}
          rowKey="id"
          loading={loading}
          size="small"
          expandable={{
            expandedRowRender,
            rowExpandable: () => true,
            expandRowByClick: true
          }}
          pagination={{
            current: page,
            pageSize: 20,
            total: data.total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`
          }}
          rowClassName={() => 'cursor-pointer'}
        />
      </Card>

      <Modal title="修改跟进记录" open={editModal.open} onCancel={() => setEditModal({ open: false, record: null })} footer={null}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="contactType" label="联系方式">
            <Select>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请填写跟进内容' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setEditModal({ open: false, record: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
