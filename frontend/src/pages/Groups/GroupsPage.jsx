import React, { useState, useEffect, useMemo } from 'react'
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Statistic, Row, Col, DatePicker, message, Divider } from 'antd'
import { PlusOutlined, BarChartOutlined, UserOutlined, TeamOutlined, WarningOutlined, EditOutlined, SearchOutlined, MergeCellsOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { groupApi, userApi } from '../../api'
import useAuthStore, { ROLE_WEIGHT } from '../../store/auth'

const { Option } = Select
const { RangePicker } = DatePicker

const GROUP_TYPE_LABELS = { COMMUNITY: '社区', REGULAR: '普群' }
const GROUP_ATTR_LABELS = { CRYPTO: '币', STOCK: '股' }

export default function GroupsPage() {
  const { user } = useAuthStore()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('mine')
  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']
  const canFilterGroup = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']
  const canEditCost = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  // 搜索
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchDateRange, setSearchDateRange] = useState(null)
  const [searchGroupNumber, setSearchGroupNumber] = useState(undefined)
  const [subordinates, setSubordinates] = useState([])

  // 新建群组
  const [createModal, setCreateModal] = useState(false)
  const [form] = Form.useForm()

  // 编辑群组（含合并）
  const [editModal, setEditModal] = useState({ open: false, group: null })
  const [editForm] = Form.useForm()
  const [mergeTargetId, setMergeTargetId] = useState(undefined)

  // 数据录入弹窗
  const [dataModal, setDataModal] = useState({ open: false, group: null })
  const [dataStats, setDataStats] = useState([])
  const [dataDate, setDataDate] = useState(dayjs())
  const [dataForm] = Form.useForm()

  // 小组编号
  const groupNumbers = useMemo(() => {
    return [...new Set(subordinates.filter(u => u.groupNumber).map(u => u.groupNumber))].sort((a, b) => a - b)
  }, [subordinates])

  // 顶部汇总
  const summaryStats = useMemo(() => {
    const active = groups.filter(g => !g.isMerged)
    return {
      totalGroups: active.length,
      totalCost: active.reduce((sum, g) => sum + (g.cost || 0), 0),
      totalCustomers: active.reduce((sum, g) => sum + (g.customerCount || 0), 0)
    }
  }, [groups])

  // 当前选中日期是否已有数据
  const existingRecord = useMemo(() => {
    if (!dataStats || dataStats.length === 0) return null
    return dataStats.find(s => dayjs(s.date).format('YYYY-MM-DD') === dataDate.format('YYYY-MM-DD')) || null
  }, [dataStats, dataDate])

  // 数据弹窗汇总
  const dataAgg = useMemo(() => {
    if (!dataStats || dataStats.length === 0 || !dataModal.group) return null
    const totalExits = dataStats.reduce((s, d) => s + (d.dailyExits || 0), 0)
    const totalConversions = dataStats.reduce((s, d) => s + (d.conversions || 0), 0)
    const totalDeposit = dataStats.reduce((s, d) => s + (d.depositUsd || 0), 0)
    const cc = dataModal.group.customerCount || 0
    const todayRecord = dataStats.find(s => dayjs(s.date).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'))
    return {
      totalExits, totalConversions, totalDeposit,
      exitRate: cc > 0 ? (totalExits / cc * 100).toFixed(1) : '0.0',
      conversionRate: cc > 0 ? (totalConversions / cc * 100).toFixed(1) : '0.0',
      todayViewers: todayRecord?.viewers || 0,
      todayInquiries: todayRecord?.inquiries || 0,
      todayIntentClients: todayRecord?.intentClients || 0,
      viewerRate: cc > 0 && todayRecord ? ((todayRecord.viewers || 0) / cc * 100).toFixed(1) : '0.0',
      inquiryRate: cc > 0 && todayRecord ? ((todayRecord.inquiries || 0) / cc * 100).toFixed(1) : '0.0',
      intentRate: cc > 0 && todayRecord ? ((todayRecord.intentClients || 0) / cc * 100).toFixed(1) : '0.0'
    }
  }, [dataStats, dataModal.group])

  useEffect(() => {
    if (canFilterGroup) userApi.subordinates().then(setSubordinates).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    const params = { viewMode }
    if (searchKeyword) params.keyword = searchKeyword
    if (searchDateRange && searchDateRange[0]) params.startDate = searchDateRange[0].startOf('day').toISOString()
    if (searchDateRange && searchDateRange[1]) params.endDate = searchDateRange[1].endOf('day').toISOString()
    if (searchGroupNumber) params.groupNumber = searchGroupNumber
    groupApi.list(params).then(setGroups).catch(() => message.error('加载失败')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [viewMode])

  const handleSearch = () => { load() }
  const handleResetSearch = () => {
    setSearchKeyword('')
    setSearchDateRange(null)
    setSearchGroupNumber(undefined)
    setLoading(true)
    groupApi.list({ viewMode }).then(setGroups).catch(() => message.error('加载失败')).finally(() => setLoading(false))
  }

  // 新建群组
  const handleCreate = async (vals) => {
    try {
      const submitData = { ...vals }
      if (vals.createdDate) submitData.createdDate = vals.createdDate.toISOString()
      await groupApi.create(submitData)
      message.success('群组创建成功')
      setCreateModal(false)
      form.resetFields()
      load()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  // 编辑群组
  const openEdit = (group) => {
    setEditModal({ open: true, group })
    setMergeTargetId(undefined)
    editForm.setFieldsValue({
      name: group.name,
      cost: group.cost,
      groupType: group.groupType || undefined,
      groupAttr: group.groupAttr || undefined,
      isActive: group.isActive,
      totalMembers: group.totalMembers || 0,
      ownAccounts: group.ownAccounts || 0,
      customerCount: group.customerCount || 0,
      remark: group.remark || ''
    })
  }

  const handleEdit = async (vals) => {
    try {
      await groupApi.update(editModal.group.id, vals)
      message.success('群组修改成功')
      setEditModal({ open: false, group: null })
      editForm.resetFields()
      load()
    } catch (err) { message.error(err.message || '修改失败') }
  }

  const handleMerge = async () => {
    if (!mergeTargetId) return message.error('请选择目标群组')
    try {
      await groupApi.merge(editModal.group.id, { targetGroupId: mergeTargetId })
      message.success('合并成功')
      setEditModal({ open: false, group: null })
      setMergeTargetId(undefined)
      load()
    } catch (err) { message.error(err.message || '合并失败') }
  }

  // 数据录入弹窗
  const openDataModal = async (group) => {
    setDataModal({ open: true, group })
    setDataDate(dayjs())
    dataForm.resetFields()
    try {
      const stats = await groupApi.stats(group.id)
      setDataStats(stats)
      const todayRecord = stats.find(s => dayjs(s.date).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'))
      if (todayRecord) {
        dataForm.setFieldsValue({
          dailyExits: todayRecord.dailyExits,
          conversions: todayRecord.conversions,
          depositUsd: todayRecord.depositUsd,
          viewers: todayRecord.viewers,
          inquiries: todayRecord.inquiries,
          intentClients: todayRecord.intentClients
        })
      }
    } catch { message.error('加载数据失败') }
  }

  const handleDateChange = (date) => {
    if (!date) return
    setDataDate(date)
    const record = dataStats.find(s => dayjs(s.date).format('YYYY-MM-DD') === date.format('YYYY-MM-DD'))
    if (record) {
      dataForm.setFieldsValue({
        dailyExits: record.dailyExits,
        conversions: record.conversions,
        depositUsd: record.depositUsd,
        viewers: record.viewers,
        inquiries: record.inquiries,
        intentClients: record.intentClients
      })
    } else {
      dataForm.setFieldsValue({
        dailyExits: undefined,
        conversions: undefined,
        depositUsd: undefined,
        viewers: undefined,
        inquiries: undefined,
        intentClients: undefined
      })
    }
  }

  const handleEditHistoryRow = (record) => {
    setDataDate(dayjs(record.date))
    dataForm.setFieldsValue({
      dailyExits: record.dailyExits,
      conversions: record.conversions,
      depositUsd: record.depositUsd,
      viewers: record.viewers,
      inquiries: record.inquiries,
      intentClients: record.intentClients
    })
  }

  const handleSubmitData = async (vals) => {
    try {
      await groupApi.addStats(dataModal.group.id, {
        ...vals,
        date: dataDate.format('YYYY-MM-DD')
      })
      message.success(existingRecord ? '数据已修改' : '数据已提交')
      const stats = await groupApi.stats(dataModal.group.id)
      setDataStats(stats)
      load()
    } catch (err) { message.error(err.message || '保存失败') }
  }

  const mergeTargetGroups = groups.filter(g => !g.isMerged && g.isActive && g.id !== editModal.group?.id)

  // 百分比渲染辅助
  const renderWithRate = (val, customerCount, color) => {
    const rate = customerCount > 0 ? (val / customerCount * 100).toFixed(1) : '0.0'
    return (
      <div>
        <div style={{ fontWeight: 500, color }}>{val}</div>
        <div style={{ fontSize: 11, color: '#999' }}>{rate}%</div>
      </div>
    )
  }

  // 主表列
  const columns = [
    {
      title: '群组名称',
      dataIndex: 'name',
      width: 140,
      fixed: 'left',
      render: (name, r) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <a onClick={() => openDataModal(r)} style={{ color: r.isMerged ? '#bbb' : undefined }}>{name}</a>
            {r.isMerged && r.mergedInto && (
              <Tag color="default" style={{ fontSize: 10, lineHeight: '16px' }}>→{r.mergedInto.name}</Tag>
            )}
          </Space>
          {!r.isMerged && r.isActive && !r.todayStats && (
            <Tag color="red" icon={<WarningOutlined />} style={{ fontSize: 10, lineHeight: '16px', marginTop: 2 }}>未更新</Tag>
          )}
        </Space>
      )
    },
    {
      title: '类型/属性',
      width: 80,
      render: (_, r) => (
        <Space size={2}>
          {r.groupType && <Tag color="blue" style={{ margin: 0 }}>{GROUP_TYPE_LABELS[r.groupType] || r.groupType}</Tag>}
          {r.groupAttr && <Tag color="purple" style={{ margin: 0 }}>{GROUP_ATTR_LABELS[r.groupAttr] || r.groupAttr}</Tag>}
        </Space>
      )
    },
    { title: '负责人', dataIndex: 'user', width: 70, render: u => u?.displayName || '-' },
    { title: '群总人数', dataIndex: 'totalMembers', width: 70, align: 'right', render: v => v || 0 },
    { title: '自己账号', dataIndex: 'ownAccounts', width: 70, align: 'right', render: v => v || 0 },
    { title: '客户人数', dataIndex: 'customerCount', width: 70, align: 'right', render: v => v || 0 },
    {
      title: '退群总数',
      width: 85,
      align: 'right',
      render: (_, r) => renderWithRate(r.cumulativeStats?.dailyExits || 0, r.customerCount, '#cf1322')
    },
    {
      title: '成交总数',
      width: 85,
      align: 'right',
      render: (_, r) => renderWithRate(r.cumulativeStats?.conversions || 0, r.customerCount, '#3f8600')
    },
    {
      title: '入金总额',
      width: 85,
      align: 'right',
      render: (_, r) => {
        const val = r.cumulativeStats?.depositUsd || 0
        return val > 0 ? <span style={{ color: '#3f8600', fontWeight: 500 }}>${val.toFixed(0)}</span> : '-'
      }
    },
    {
      title: '今日看群',
      width: 85,
      align: 'right',
      render: (_, r) => {
        if (!r.todayStats) return <span style={{ color: '#ccc' }}>-</span>
        return renderWithRate(r.todayStats.viewers || 0, r.customerCount)
      }
    },
    {
      title: '今日咨询',
      width: 85,
      align: 'right',
      render: (_, r) => {
        if (!r.todayStats) return <span style={{ color: '#ccc' }}>-</span>
        return renderWithRate(r.todayStats.inquiries || 0, r.customerCount, '#1677ff')
      }
    },
    {
      title: '今日意向',
      width: 85,
      align: 'right',
      render: (_, r) => {
        if (!r.todayStats) return <span style={{ color: '#ccc' }}>-</span>
        return renderWithRate(r.todayStats.intentClients || 0, r.customerCount, '#faad14')
      }
    },
    { title: '月成本', dataIndex: 'cost', width: 80, align: 'right', render: v => `$${v?.toFixed(0)}` },
    {
      title: '状态',
      width: 60,
      render: (_, r) => r.isMerged
        ? <Tag color="default">已合并</Tag>
        : r.isActive ? <Tag color="green">活跃</Tag> : <Tag>停用</Tag>
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<BarChartOutlined />} onClick={() => openDataModal(r)}>数据</Button>
          {!r.isMerged && canEditCost && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          )}
        </Space>
      )
    }
  ]

  // 历史记录表列
  const historyColumns = [
    { title: '日期', dataIndex: 'date', width: 100, render: v => dayjs(v).format('YYYY-MM-DD') },
    { title: '退群', dataIndex: 'dailyExits', width: 60, align: 'right' },
    { title: '成交', dataIndex: 'conversions', width: 60, align: 'right' },
    { title: '入金', dataIndex: 'depositUsd', width: 80, align: 'right', render: v => v > 0 ? `$${v.toFixed(0)}` : '-' },
    { title: '看群', dataIndex: 'viewers', width: 60, align: 'right' },
    { title: '咨询', dataIndex: 'inquiries', width: 60, align: 'right' },
    { title: '意向', dataIndex: 'intentClients', width: 60, align: 'right' },
    {
      title: '操作',
      width: 60,
      render: (_, r) => <Button type="link" size="small" onClick={() => handleEditHistoryRow(r)}>编辑</Button>
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .groups-table .ant-table-tbody > tr:nth-child(even) > td { background: #fafafa; }
        .groups-table .row-merged > td { opacity: 0.5; }
      `}</style>

      {canViewTeam && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <span style={{ color: '#666' }}>数据范围：</span>
            <Button.Group>
              <Button type={viewMode === 'mine' ? 'primary' : 'default'} icon={<UserOutlined />} onClick={() => setViewMode('mine')}>我的群组</Button>
              <Button type={viewMode === 'all' ? 'primary' : 'default'} icon={<TeamOutlined />} onClick={() => setViewMode('all')}>团队群组</Button>
            </Button.Group>
          </Space>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            placeholder="群组名称"
            prefix={<SearchOutlined />}
            allowClear
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            style={{ width: 180 }}
            onPressEnter={handleSearch}
          />
          <RangePicker value={searchDateRange} onChange={setSearchDateRange} placeholder={['开始日期', '结束日期']} />
          {viewMode === 'all' && canFilterGroup && groupNumbers.length > 0 && (
            <Select placeholder="小组" allowClear value={searchGroupNumber} onChange={setSearchGroupNumber} style={{ width: 90 }}>
              {groupNumbers.map(n => <Option key={n} value={n}>{n}组</Option>)}
            </Select>
          )}
          <Button type="primary" onClick={handleSearch}>搜索</Button>
          <Button onClick={handleResetSearch}>重置</Button>
        </Space>
      </Card>

      <Card
        title={
          <Space size="large">
            <span>群组管理</span>
            <span style={{ fontSize: 13, fontWeight: 'normal', color: '#666' }}>
              活跃群组 <strong style={{ color: '#1677ff' }}>{summaryStats.totalGroups}</strong>
              <span style={{ margin: '0 12px', color: '#d9d9d9' }}>|</span>
              总月成本 <strong style={{ color: '#cf1322' }}>${summaryStats.totalCost.toLocaleString()}</strong>
              <span style={{ margin: '0 12px', color: '#d9d9d9' }}>|</span>
              总客户数 <strong style={{ color: '#1677ff' }}>{summaryStats.totalCustomers}</strong>
            </span>
          </Space>
        }
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>新建群组</Button>}
      >
        <div className="groups-table">
          <Table
            columns={columns}
            dataSource={groups}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1400 }}
            size="small"
            rowClassName={r => r.isMerged ? 'row-merged' : ''}
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        </div>
      </Card>

      {/* 新建群组 */}
      <Modal title="新建群组" open={createModal} onCancel={() => setCreateModal(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="群组名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="groupType" label="类型">
                <Select allowClear placeholder="选择">
                  <Option value="COMMUNITY">社区</Option>
                  <Option value="REGULAR">普群</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="groupAttr" label="属性">
                <Select allowClear placeholder="选择">
                  <Option value="CRYPTO">币</Option>
                  <Option value="STOCK">股</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="totalMembers" label="群总人数" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ownAccounts" label="自己账号数" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="customerCount" label="客户人数" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost" label="月成本 (USD)" initialValue={3500}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="$" disabled={!canEditCost} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="createdDate" label="创建日期" initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="群组备注" maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setCreateModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑群组 + 合并 */}
      <Modal title={`编辑群组 — ${editModal.group?.name}`} open={editModal.open} onCancel={() => setEditModal({ open: false, group: null })} footer={null} width={600}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="群组名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="groupType" label="类型">
                <Select allowClear placeholder="选择">
                  <Option value="COMMUNITY">社区</Option>
                  <Option value="REGULAR">普群</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="groupAttr" label="属性">
                <Select allowClear placeholder="选择">
                  <Option value="CRYPTO">币</Option>
                  <Option value="STOCK">股</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="totalMembers" label="群总人数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ownAccounts" label="自己账号数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="customerCount" label="客户人数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost" label="月成本 (USD)">
                <InputNumber min={0} style={{ width: '100%' }} prefix="$" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="状态">
                <Select>
                  <Option value={true}>活跃</Option>
                  <Option value={false}>已停用</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="群组备注" maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setEditModal({ open: false, group: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>

        {!editModal.group?.isMerged && (
          <>
            <Divider />
            <div>
              <h4 style={{ color: '#999', marginBottom: 12 }}>
                <MergeCellsOutlined /> 合并群组
              </h4>
              <p style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                合并后此群组将标记为已合并并显示为灰色，原有数据保留。
              </p>
              <Space>
                <Select
                  placeholder="选择目标群组"
                  value={mergeTargetId}
                  onChange={setMergeTargetId}
                  style={{ width: 200 }}
                  showSearch
                  filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}
                >
                  {mergeTargetGroups.map(g => <Option key={g.id} value={g.id}>{g.name}</Option>)}
                </Select>
                <Button danger onClick={handleMerge}>确认合并</Button>
              </Space>
            </div>
          </>
        )}
      </Modal>

      {/* 数据录入弹窗 */}
      <Modal
        title={`群组数据 — ${dataModal.group?.name}`}
        open={dataModal.open}
        onCancel={() => { setDataModal({ open: false, group: null }); setDataStats([]) }}
        footer={null}
        width={900}
      >
        {/* 基础信息 */}
        <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
          <Row gutter={24}>
            <Col span={8}>
              <Statistic title="群总人数" value={dataModal.group?.totalMembers || 0} valueStyle={{ fontSize: 20 }} />
            </Col>
            <Col span={8}>
              <Statistic title="自己账号数" value={dataModal.group?.ownAccounts || 0} valueStyle={{ fontSize: 20 }} />
            </Col>
            <Col span={8}>
              <Statistic title="客户人数" value={dataModal.group?.customerCount || 0} valueStyle={{ fontSize: 20 }} />
            </Col>
          </Row>
        </Card>

        {/* 汇总统计 */}
        {dataAgg && (
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={16}>
              <Col span={4}>
                <Statistic title="退群总数" value={dataAgg.totalExits} valueStyle={{ fontSize: 16, color: '#cf1322' }}
                  suffix={<span style={{ fontSize: 11, color: '#999' }}>({dataAgg.exitRate}%)</span>} />
              </Col>
              <Col span={4}>
                <Statistic title="成交总数" value={dataAgg.totalConversions} valueStyle={{ fontSize: 16, color: '#3f8600' }}
                  suffix={<span style={{ fontSize: 11, color: '#999' }}>({dataAgg.conversionRate}%)</span>} />
              </Col>
              <Col span={4}>
                <Statistic title="入金总额" value={dataAgg.totalDeposit} valueStyle={{ fontSize: 16 }} prefix="$" precision={0} />
              </Col>
              <Col span={4}>
                <Statistic title="今日看群" value={dataAgg.todayViewers} valueStyle={{ fontSize: 16 }}
                  suffix={<span style={{ fontSize: 11, color: '#999' }}>({dataAgg.viewerRate}%)</span>} />
              </Col>
              <Col span={4}>
                <Statistic title="今日咨询" value={dataAgg.todayInquiries} valueStyle={{ fontSize: 16, color: '#1677ff' }}
                  suffix={<span style={{ fontSize: 11, color: '#999' }}>({dataAgg.inquiryRate}%)</span>} />
              </Col>
              <Col span={4}>
                <Statistic title="今日意向" value={dataAgg.todayIntentClients} valueStyle={{ fontSize: 16, color: '#faad14' }}
                  suffix={<span style={{ fontSize: 11, color: '#999' }}>({dataAgg.intentRate}%)</span>} />
              </Col>
            </Row>
          </Card>
        )}

        {/* 数据录入表单 */}
        <Card size="small" title={
          <Space>
            <span>数据录入</span>
            <DatePicker value={dataDate} onChange={handleDateChange} allowClear={false} />
            {!dataDate.isSame(dayjs(), 'day') && (
              <Button size="small" type="link" onClick={() => handleDateChange(dayjs())}>返回今日</Button>
            )}
            {existingRecord && <Tag color="blue">已有数据</Tag>}
          </Space>
        } style={{ marginBottom: 16 }}>
          <Form form={dataForm} layout="vertical" onFinish={handleSubmitData}>
            <Row gutter={24}>
              <Col span={12}>
                <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>累积数据</div>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item name="dailyExits" label="退群人数">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="conversions" label="成交人数">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="depositUsd" label="入金金额">
                      <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="$" />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>当日数据</div>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item name="viewers" label="看群人数">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="inquiries" label="咨询人数">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="intentClients" label="意向客户">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Col>
            </Row>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit">{existingRecord ? '修改' : '提交'}</Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 历史记录 */}
        <Card size="small" title="历史记录">
          <Table
            columns={historyColumns}
            dataSource={dataStats}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            rowClassName={(r) => dayjs(r.date).format('YYYY-MM-DD') === dataDate.format('YYYY-MM-DD') ? 'ant-table-row-selected' : ''}
          />
        </Card>
      </Modal>
    </div>
  )
}
