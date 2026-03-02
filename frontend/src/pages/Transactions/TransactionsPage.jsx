import React, { useState, useEffect, useMemo } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, Statistic, Row, Col, DatePicker, message } from 'antd'
import { PlusOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { transactionApi, customerApi, userApi } from '../../api'
import { CURRENCY_LABELS } from '../../store/auth'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'

const { Option } = Select
const { RangePicker } = DatePicker

export default function TransactionsPage() {
  const { user } = useAuthStore()
  const [data, setData] = useState({ data: [], total: 0 })
  const [stats, setStats] = useState(null)
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()
  const [customers, setCustomers] = useState([])
  const [selectedCurrency, setSelectedCurrency] = useState(null)
  const [viewMode, setViewMode] = useState('mine')
  const [subordinates, setSubordinates] = useState([])
  const [filterGroupNumber, setFilterGroupNumber] = useState(undefined)
  const [filterUserId, setFilterUserId] = useState(undefined)

  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']
  const canFilterGroup = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']

  // 提取可用小组编号
  const groupNumbers = useMemo(() => {
    const nums = [...new Set(subordinates.filter(u => u.groupNumber).map(u => u.groupNumber))].sort((a, b) => a - b)
    return nums
  }, [subordinates])

  // 默认当月范围
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('day')])

  useEffect(() => {
    if (canViewTeam) userApi.subordinates().then(setSubordinates).catch(() => {})
  }, [])

  const load = (range, mode, gn, uid) => {
    const r = range !== undefined ? range : dateRange
    const vm = mode || viewMode
    const params = { viewMode: vm }
    if (r && r[0]) params.startDate = r[0].startOf('day').toISOString()
    if (r && r[1]) params.endDate = r[1].endOf('day').toISOString()
    const gnVal = gn !== undefined ? gn : filterGroupNumber
    const uidVal = uid !== undefined ? uid : filterUserId
    if (gnVal) params.groupNumber = gnVal
    if (uidVal) params.assignedUserId = uidVal

    setLoading(true)
    Promise.all([
      transactionApi.list(params),
      transactionApi.stats(params),
      transactionApi.rates()
    ]).then(([d, s, r2]) => {
      setData(d)
      setStats(s)
      setRates(r2)
    }).catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  const searchCustomers = (keyword) => {
    if (!keyword) return
    customerApi.list({ keyword, pageSize: 20 }).then(r => setCustomers(r.data || []))
  }

  useEffect(() => { load() }, [])

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    setFilterGroupNumber(undefined)
    setFilterUserId(undefined)
    load(undefined, mode, undefined, undefined)
  }

  const handleCreate = async (vals) => {
    try {
      await transactionApi.create(vals)
      message.success('记录已添加')
      setModal(false)
      form.resetFields()
      setSelectedCurrency(null)
      load()
    } catch (err) { message.error(err.message || '添加失败') }
  }

  const columns = [
    { title: '类型', dataIndex: 'type', render: v => <Tag color={v === 'DEPOSIT' ? 'green' : 'red'}>{v === 'DEPOSIT' ? '入金' : '出金'}</Tag> },
    { title: '客户', dataIndex: 'customer', render: c => c ? `${c.name}${c.uid ? ` (${c.uid})` : ''}` : '-' },
    { title: '币种', dataIndex: 'currency' },
    { title: '数量', dataIndex: 'amount' },
    { title: 'USD金额', dataIndex: 'usdAmount', render: v => <strong>${v?.toFixed(2)}</strong> },
    { title: '汇率', dataIndex: 'rateAtTime', render: v => v === 1 ? '-' : `$${v?.toFixed(2)}` },
    { title: '业务员', dataIndex: 'user', render: u => u?.displayName || '-' },
    { title: '备注', dataIndex: 'note', render: v => v || '-' },
    { title: '时间', dataIndex: 'recordedAt', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') }
  ]

  const isManualUsd = selectedCurrency === 'BTC' || selectedCurrency === 'ETH'

  return (
    <div style={{ padding: 24 }}>
      {/* 当前汇率 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          <span style={{ color: '#999' }}>当前汇率：</span>
          <span><strong>BTC</strong> = ${rates.BTC?.toLocaleString()}</span>
          <span><strong>ETH</strong> = ${rates.ETH?.toLocaleString()}</span>
          <span><strong>USDT</strong> = $1.00</span>
          <span><strong>USDC</strong> = $1.00</span>
        </Space>
      </Card>

      {/* 视图切换 + 筛选 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          {canViewTeam && (
            <>
              <span style={{ color: '#666' }}>数据范围：</span>
              <Button.Group>
                <Button type={viewMode === 'mine' ? 'primary' : 'default'} icon={<UserOutlined />} onClick={() => handleViewModeChange('mine')}>个人</Button>
                <Button type={viewMode === 'all' ? 'primary' : 'default'} icon={<TeamOutlined />} onClick={() => handleViewModeChange('all')}>团队</Button>
              </Button.Group>
              <span style={{ borderLeft: '1px solid #d9d9d9', height: 20, margin: '0 4px' }} />
            </>
          )}
          <span>时间范围：</span>
          <RangePicker
            value={dateRange}
            onChange={val => { setDateRange(val); load(val) }}
            presets={[
              { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '近7天', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: '近30天', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] }
            ]}
          />
          <Button onClick={() => { setDateRange(null); load([null, null]) }}>全部</Button>
          {viewMode === 'all' && canFilterGroup && groupNumbers.length > 0 && (
            <Select
              placeholder="小组"
              allowClear
              value={filterGroupNumber}
              onChange={val => { setFilterGroupNumber(val); setFilterUserId(undefined); load(undefined, undefined, val, undefined) }}
              style={{ width: 90 }}
            >
              {groupNumbers.map(n => <Option key={n} value={n}>{n}组</Option>)}
            </Select>
          )}
          {viewMode === 'all' && canViewTeam && subordinates.length > 0 && (
            <Select
              placeholder="负责人"
              allowClear
              value={filterUserId}
              onChange={val => { setFilterUserId(val); load(undefined, undefined, undefined, val) }}
              style={{ width: 120 }}
              showSearch
              filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}
            >
              {subordinates.map(u => <Option key={u.id} value={u.id}>{u.displayName || u.username}</Option>)}
            </Select>
          )}
        </Space>
      </Card>

      {/* 统计 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="总入金 (USD)" value={stats.totalDepositUsd} prefix="$" precision={2} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="入金笔数" value={stats.depositCount} /></Card></Col>
          <Col span={6}><Card><Statistic title="总出金 (USD)" value={stats.totalWithdrawalUsd} prefix="$" precision={2} valueStyle={{ color: '#cf1322' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="净额 (USD)" value={stats.netUsd} prefix="$" precision={2} valueStyle={{ color: stats.netUsd >= 0 ? '#3f8600' : '#cf1322' }} /></Card></Col>
        </Row>
      )}

      <Card
        title="财务记录"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)}>添加记录</Button>}
      >
        <Table columns={columns} dataSource={data.data} rowKey="id" loading={loading} pagination={{ total: data.total }} />
      </Card>

      <Modal title="添加财务记录" open={modal} onCancel={() => { setModal(false); setSelectedCurrency(null) }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="customerId" label="关联客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              placeholder="搜索客户姓名或电话"
              filterOption={false}
              onSearch={searchCustomers}
            >
              {customers.map(c => <Option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="DEPOSIT">
            <Select>
              <Option value="DEPOSIT">入金</Option>
              <Option value="WITHDRAWAL">出金</Option>
            </Select>
          </Form.Item>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
            <Select onChange={val => setSelectedCurrency(val)}>
              {Object.entries(CURRENCY_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="数量" rules={[{ required: true }]}>
            <Input type="number" step="0.00000001" />
          </Form.Item>
          {isManualUsd && (
            <Form.Item
              name="usdAmount"
              label="USD 金额（手动填写）"
              rules={[{ required: true, message: 'BTC/ETH 需手动填写 USD 金额' }]}
              extra="请根据实际成交汇率手动输入 USD 等值金额"
            >
              <Input type="number" step="0.01" prefix="$" />
            </Form.Item>
          )}
          <Form.Item name="note" label="备注"><Input /></Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交</Button>
              <Button onClick={() => { setModal(false); setSelectedCurrency(null) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
