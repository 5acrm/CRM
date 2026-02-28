import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, message, Tabs, List, Typography, Switch } from 'antd'
import { PlusOutlined, CheckOutlined, SendOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { translationApi, customerApi, userApi } from '../../api'
import useAuthStore from '../../store/auth'

const { Option } = Select
const { TextArea } = Input
const { Text } = Typography

export default function TranslationsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isTranslator = user.role === 'TRANSLATOR'
  const [tasks, setTasks] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [completeModal, setCompleteModal] = useState({ open: false, task: null })
  const [pushModal, setPushModal] = useState(false)
  const [searchModal, setSearchModal] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [customers, setCustomers] = useState([])
  const [subordinates, setSubordinates] = useState([])
  const [translators, setTranslators] = useState([])
  const [pushAll, setPushAll] = useState(false)
  const [form] = Form.useForm()
  const [completeForm] = Form.useForm()
  const [pushForm] = Form.useForm()

  const load = (status) => {
    setLoading(true)
    translationApi.list({ status })
      .then(setTasks)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    customerApi.list({ pageSize: 50 }).then(r => setCustomers(r.data || [])).catch(() => {})
    if (!isTranslator) {
      userApi.translators().then(setTranslators).catch(() => {})
    }
    if (isTranslator) {
      userApi.subordinates().then(setSubordinates).catch(() => {})
    }
  }, [])

  const handleCreate = async (vals) => {
    try {
      await translationApi.create(vals)
      message.success('翻译请求已发送')
      setCreateModal(false)
      form.resetFields()
      load()
    } catch (err) { message.error(err.message || '发送失败') }
  }

  const handleComplete = async (vals) => {
    try {
      await translationApi.complete(completeModal.task.id, vals)
      message.success('翻译已完成并回推')
      setCompleteModal({ open: false, task: null })
      completeForm.resetFields()
      load()
    } catch (err) { message.error(err.message || '提交失败') }
  }

  const handlePush = async (vals) => {
    try {
      await translationApi.push({ ...vals, pushAll })
      message.success('消息已推送')
      setPushModal(false)
      pushForm.resetFields()
      setPushAll(false)
    } catch (err) { message.error(err.message || '推送失败') }
  }

  const handleSearch = async (vals) => {
    try {
      const results = await translationApi.searchCustomer(vals.phone)
      setSearchResults(results)
    } catch (err) { message.error(err.message || '搜索失败') }
  }

  const columns = [
    { title: '状态', dataIndex: 'status', render: v => v === 'PENDING' ? <Tag color="orange">待处理</Tag> : <Tag color="green">已完成</Tag> },
    { title: '发起人', dataIndex: 'requester', render: u => u?.displayName || '-' },
    { title: '关联客户', dataIndex: 'customer', render: c => c ? `${c.name}` : '-' },
    { title: '翻译内容', dataIndex: 'content', ellipsis: true },
    { title: '翻译结果', dataIndex: 'result', ellipsis: true, render: v => v || '-' },
    { title: '发起时间', dataIndex: 'createdAt', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作', render: (_, r) => (
        <Space>
          {isTranslator && r.customer && (
            <Button size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/customers/${r.customer.id}`)}>查看客户</Button>
          )}
          {isTranslator && r.status === 'PENDING' && (
            <Button size="small" icon={<CheckOutlined />} type="primary"
              onClick={() => setCompleteModal({ open: true, task: r })}>完成翻译</Button>
          )}
        </Space>
      )
    }
  ]

  const tabItems = [
    {
      key: 'all',
      label: '全部',
      children: <Table columns={columns} dataSource={tasks.data} rowKey="id" loading={loading} />
    },
    {
      key: 'PENDING',
      label: '待处理',
      children: <Table columns={columns} dataSource={tasks.data.filter(t => t.status === 'PENDING')} rowKey="id" />
    },
    {
      key: 'COMPLETED',
      label: '已完成',
      children: <Table columns={columns} dataSource={tasks.data.filter(t => t.status === 'COMPLETED')} rowKey="id" />
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="翻译服务"
        extra={
          <Space>
            {isTranslator && (
              <>
                <Button icon={<SearchOutlined />} onClick={() => setSearchModal(true)}>搜索客户</Button>
                <Button icon={<SendOutlined />} onClick={() => { setPushModal(true); setPushAll(false) }}>主动推送</Button>
              </>
            )}
            {!isTranslator && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>发起翻译请求</Button>
            )}
          </Space>
        }
      >
        <Tabs items={tabItems} onChange={k => load(k === 'all' ? undefined : k)} />
      </Card>

      {/* 发起翻译请求 */}
      <Modal title="发起翻译请求" open={createModal} onCancel={() => setCreateModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="translatorId" label="选择翻译员" rules={[{ required: true, message: '请选择翻译员' }]}>
            <Select placeholder="选择翻译员">
              {translators.map(t => <Option key={t.id} value={t.id}>{t.displayName || t.username}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="翻译内容" rules={[{ required: true }]}>
            <TextArea rows={5} placeholder="请输入需要翻译的内容" />
          </Form.Item>
          <Form.Item name="customerId" label="关联客户（可选）">
            <Select placeholder="选择关联客户" allowClear showSearch filterOption={false}>
              {customers.map(c => <Option key={c.id} value={c.id}>{c.name} {c.phone || ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">发送</Button>
              <Button onClick={() => setCreateModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 完成翻译 */}
      <Modal
        title={`完成翻译 - ${completeModal.task?.requester?.displayName} 的请求`}
        open={completeModal.open}
        onCancel={() => setCompleteModal({ open: false, task: null })}
        footer={null}
      >
        {completeModal.task && (
          <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 16 }}>
            <Text strong>原文：</Text>
            <div>{completeModal.task.content}</div>
          </div>
        )}
        <Form form={completeForm} layout="vertical" onFinish={handleComplete}>
          <Form.Item name="result" label="翻译结果" rules={[{ required: true }]}>
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交并回推</Button>
              <Button onClick={() => setCompleteModal({ open: false, task: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 翻译主动推送 */}
      <Modal
        title="主动推送消息"
        open={pushModal}
        onCancel={() => { setPushModal(false); setPushAll(false) }}
        footer={null}
      >
        <Form form={pushForm} layout="vertical" onFinish={handlePush}>
          <Form.Item label="推送范围">
            <Space>
              <Switch checked={pushAll} onChange={v => { setPushAll(v); if (v) pushForm.setFieldValue('targetUserIds', []) }} />
              <span>{pushAll ? '推送给全体人员' : '选择指定人员'}</span>
            </Space>
          </Form.Item>
          {!pushAll && (
            <Form.Item name="targetUserIds" label="推送给" rules={[{ required: true, message: '请选择接收人' }]}>
              <Select mode="multiple" placeholder="选择接收人">
                {subordinates.map(u => <Option key={u.id} value={u.id}>{u.displayName || u.username}</Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="customerId" label="关联客户（可选）">
            <Select placeholder="选择关联客户" allowClear showSearch filterOption={false}>
              {customers.map(c => <Option key={c.id} value={c.id}>{c.name} {c.phone || ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="消息内容" rules={[{ required: true }]}>
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">推送</Button>
              <Button onClick={() => { setPushModal(false); setPushAll(false) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 搜索客户（翻译用） */}
      <Modal title="通过电话搜索客户" open={searchModal} onCancel={() => { setSearchModal(false); setSearchResults([]) }} footer={null} width={700}>
        <Form layout="inline" onFinish={handleSearch} style={{ marginBottom: 16 }}>
          <Form.Item name="phone" rules={[{ required: true, message: '请输入电话号码' }]}>
            <Input placeholder="输入电话号码" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">搜索</Button>
          </Form.Item>
        </Form>
        <List
          dataSource={searchResults}
          renderItem={c => (
            <List.Item>
              <List.Item.Meta
                title={`${c.name} ${c.uid ? `(UID: ${c.uid})` : ''}`}
                description={
                  <Space>
                    <span>📞 {c.phone || '-'}</span>
                    <span>📧 {c.email || '-'}</span>
                    <span>群组: {c.currentGroup?.name || '-'}</span>
                    <span>负责: {c.createdBy?.displayName || '-'}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '未找到客户' }}
        />
      </Modal>
    </div>
  )
}
