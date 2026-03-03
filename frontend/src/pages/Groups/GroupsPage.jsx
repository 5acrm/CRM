import React, { useState, useEffect, useMemo } from 'react'
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Statistic, Row, Col, DatePicker, message, Tooltip } from 'antd'
import { PlusOutlined, BarChartOutlined, MergeCellsOutlined, UserOutlined, TeamOutlined, WarningOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
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
  const [createModal, setCreateModal] = useState(false)
  const canViewTeam = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']
  const canFilterGroup = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['SUPERVISOR']
  const [editModal, setEditModal] = useState({ open: false, group: null })
  const [editForm] = Form.useForm()
  const [mergeModal, setMergeModal] = useState({ open: false, group: null })
  const [statsModal, setStatsModal] = useState({ open: false, group: null })
  const [statsData, setStatsData] = useState([])
  const [addStatsModal, setAddStatsModal] = useState({ open: false, groupId: null })
  const [summary, setSummary] = useState(null)
  const [summaryMonth, setSummaryMonth] = useState(dayjs())
  const [missingStatsIds, setMissingStatsIds] = useState(new Set())
  const [form] = Form.useForm()
  const [statsForm] = Form.useForm()
  const [mergeForm] = Form.useForm()
  const canEditCost = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  // 搜索状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchDateRange, setSearchDateRange] = useState(null)
  const [searchGroupNumber, setSearchGroupNumber] = useState(undefined)
  const [subordinates, setSubordinates] = useState([])

  // 提取可用小组编号
  const groupNumbers = useMemo(() => {
    const nums = [...new Set(subordinates.filter(u => u.groupNumber).map(u => u.groupNumber))].sort((a, b) => a - b)
    return nums
  }, [subordinates])

  // 汇总统计（排除已合并群组）
  const summaryStats = useMemo(() => {
    const active = groups.filter(g => !g.isMerged)
    return {
      totalGroups: active.length,
      totalCost: active.reduce((sum, g) => sum + (g.cost || 0), 0),
      totalCustomers: active.reduce((sum, g) => sum + (g._count?.customers || 0), 0)
    }
  }, [groups])

  // 每日数据汇总统计（弹窗用）
  const dailyStatsAgg = useMemo(() => {
    if (!statsData || statsData.length === 0) return null
    const latest = statsData[0] // 按日期倒序，第一条是最新
    const totalExits = statsData.reduce((s, d) => s + (d.dailyExits || 0), 0)
    const totalViewers = statsData.reduce((s, d) => s + (d.viewers || 0), 0)
    const totalInquiries = statsData.reduce((s, d) => s + (d.inquiries || 0), 0)
    const totalConversions = statsData.reduce((s, d) => s + (d.conversions || 0), 0)
    const latestTotal = latest.totalMembers || 0
    const latestReal = latest.realCustomers || 0
    return {
      latestTotal, latestReal, totalExits, totalViewers, totalInquiries, totalConversions,
      inquiryRate: totalViewers > 0 ? (totalInquiries / totalViewers * 100).toFixed(1) : '0',
      conversionRate: totalInquiries > 0 ? (totalConversions / totalInquiries * 100).toFixed(1) : '0',
      exitRate: latestTotal > 0 ? (totalExits / latestTotal * 100).toFixed(1) : '0'
    }
  }, [statsData])

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

  useEffect(() => {
    groupApi.missingStats().then(data => {
      setMissingStatsIds(new Set(data.map(g => g.id)))
    }).catch(() => {})
  }, [])

  const handleSearch = () => { load() }
  const handleResetSearch = () => {
    setSearchKeyword('')
    setSearchDateRange(null)
    setSearchGroupNumber(undefined)
    // 重新加载不带筛选条件
    setLoading(true)
    groupApi.list({ viewMode }).then(setGroups).catch(() => message.error('加载失败')).finally(() => setLoading(false))
  }

  const handleCreate = async (vals) => {
    try {
      const submitData = { ...vals }
      if (vals.createdDate) {
        submitData.createdDate = vals.createdDate.toISOString()
      }
      await groupApi.create(submitData)
      message.success('群组创建成功')
      setCreateModal(false)
      form.resetFields()
      load()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const openEdit = (group) => {
    setEditModal({ open: true, group })
    editForm.setFieldsValue({
      name: group.name,
      cost: group.cost,
      groupType: group.groupType || undefined,
      groupAttr: group.groupAttr || undefined,
      isActive: group.isActive,
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

  const openStats = async (group, month) => {
    const m = month || summaryMonth
    setStatsModal({ open: true, group })
    const [stats, sum] = await Promise.all([
      groupApi.stats(group.id),
      groupApi.summary(group.id, { month: m.format('YYYY-MM') })
    ])
    setStatsData(stats)
    setSummary(sum)
  }

  const handleMonthChange = async (val) => {
    setSummaryMonth(val)
    if (statsModal.group && val) {
      const sum = await groupApi.summary(statsModal.group.id, { month: val.format('YYYY-MM') })
      setSummary(sum)
    }
  }

  const handleAddStats = async (vals) => {
    try {
      await groupApi.addStats(statsModal.group.id, {
        ...vals,
        date: vals.date ? vals.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
      })
      message.success('数据已保存')
      setAddStatsModal({ open: false, groupId: null })
      statsForm.resetFields()
      openStats(statsModal.group)
    } catch (err) { message.error(err.message || '保存失败') }
  }

  const handleMerge = async (vals) => {
    try {
      await groupApi.merge(mergeModal.group.id, { targetGroupId: vals.targetGroupId })
      message.success('合并成功')
      setMergeModal({ open: false, group: null })
      mergeForm.resetFields()
      load()
    } catch (err) { message.error(err.message || '合并失败') }
  }

  const columns = [
    {
      title: '群组名称',
      dataIndex: 'name',
      render: (name, r) => (
        <Space>
          <a
            onClick={() => openStats(r)}
            style={{ color: r.isMerged ? '#bbb' : undefined }}
          >
            {name}
          </a>
          {r.isMerged && r.mergedInto && (
            <Tag color="default" style={{ fontSize: 11 }}>已合并到：{r.mergedInto.name}</Tag>
          )}
          {missingStatsIds.has(r.id) && (
            <Tag color="red" icon={<WarningOutlined />}>未更新今日数据</Tag>
          )}
        </Space>
      )
    },
    {
      title: '类型/属性',
      width: 80,
      render: (_, r) => (
        <Space size={4}>
          {r.groupType && <Tag color="blue">{GROUP_TYPE_LABELS[r.groupType] || r.groupType}</Tag>}
          {r.groupAttr && <Tag color="purple">{GROUP_ATTR_LABELS[r.groupAttr] || r.groupAttr}</Tag>}
        </Space>
      )
    },
    { title: '负责人', dataIndex: 'user', width: 70, render: u => u?.displayName || '-' },
    { title: '月成本', dataIndex: 'cost', width: 80, render: v => `$${v?.toFixed(0)}/月` },
    { title: '客户数', dataIndex: '_count', width: 70, render: c => c?.customers || 0 },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 150,
      ellipsis: true,
      render: v => v ? <Tooltip title={v}><span>{v}</span></Tooltip> : '-'
    },
    {
      title: '状态',
      width: 60,
      render: (_, r) => r.isMerged
        ? <Tag color="default">已合并</Tag>
        : r.isActive ? <Tag color="green">活跃</Tag> : <Tag>已停用</Tag>
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 100, render: v => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<BarChartOutlined />} onClick={() => openStats(r)}>数据</Button>
          {!r.isMerged && canEditCost && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          )}
          {!r.isMerged && (
            <Button
              size="small"
              icon={<MergeCellsOutlined />}
              onClick={() => { setMergeModal({ open: true, group: r }); mergeForm.resetFields() }}
            >合并</Button>
          )}
        </Space>
      )
    }
  ]

  const statColumns = [
    { title: '日期', dataIndex: 'date', render: v => dayjs(v).format('YYYY-MM-DD') },
    { title: '总人数', dataIndex: 'totalMembers' },
    { title: '真实客户', dataIndex: 'realCustomers' },
    { title: '自己账号', dataIndex: 'ownAccounts' },
    { title: '退群人数', dataIndex: 'dailyExits' },
    { title: '看群人数', dataIndex: 'viewers' },
    { title: '咨询人数', dataIndex: 'inquiries' },
    { title: '成交人数', dataIndex: 'conversions' },
    { title: '入金(USD)', dataIndex: 'depositUsd', render: v => `$${v?.toFixed(2)}` }
  ]

  const mergeTargetGroups = groups.filter(g => !g.isMerged && g.isActive && g.id !== mergeModal.group?.id)

  return (
    <div style={{ padding: 24 }}>
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

      {/* 搜索栏 */}
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
          <RangePicker
            value={searchDateRange}
            onChange={setSearchDateRange}
            placeholder={['开始日期', '结束日期']}
          />
          {viewMode === 'all' && canFilterGroup && groupNumbers.length > 0 && (
            <Select
              placeholder="小组"
              allowClear
              value={searchGroupNumber}
              onChange={setSearchGroupNumber}
              style={{ width: 90 }}
            >
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
        <Table
          columns={columns}
          dataSource={groups}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          rowClassName={r => r.isMerged ? 'row-disabled' : ''}
        />
      </Card>

      {/* 创建群组 */}
      <Modal title="新建群组" open={createModal} onCancel={() => setCreateModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="群组名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="groupType" label="群组类型">
            <Select allowClear placeholder="选择类型">
              <Option value="COMMUNITY">社区</Option>
              <Option value="REGULAR">普群</Option>
            </Select>
          </Form.Item>
          <Form.Item name="groupAttr" label="群组属性">
            <Select allowClear placeholder="选择属性">
              <Option value="CRYPTO">币</Option>
              <Option value="STOCK">股</Option>
            </Select>
          </Form.Item>
          <Form.Item name="createdDate" label="创建日期" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cost" label="月成本 (USD/月)" initialValue={3500}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="$" disabled={!canEditCost} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="群组备注" maxLength={500} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setCreateModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑群组 */}
      <Modal title={`编辑群组 — ${editModal.group?.name}`} open={editModal.open} onCancel={() => setEditModal({ open: false, group: null })} footer={null}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="群组名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="groupType" label="群组类型">
            <Select allowClear placeholder="选择类型">
              <Option value="COMMUNITY">社区</Option>
              <Option value="REGULAR">普群</Option>
            </Select>
          </Form.Item>
          <Form.Item name="groupAttr" label="群组属性">
            <Select allowClear placeholder="选择属性">
              <Option value="CRYPTO">币</Option>
              <Option value="STOCK">股</Option>
            </Select>
          </Form.Item>
          <Form.Item name="cost" label="月成本 (USD/月)">
            <InputNumber min={0} style={{ width: '100%' }} prefix="$" />
          </Form.Item>
          <Form.Item name="isActive" label="状态">
            <Select>
              <Option value={true}>活跃</Option>
              <Option value={false}>已停用</Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="群组备注" maxLength={500} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setEditModal({ open: false, group: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 合并群组 */}
      <Modal
        title={`合并群组 — ${mergeModal.group?.name}`}
        open={mergeModal.open}
        onCancel={() => setMergeModal({ open: false, group: null })}
        footer={null}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          合并后，「{mergeModal.group?.name}」将标记为已合并并显示为灰色，原有数据全部保留。
        </p>
        <Form form={mergeForm} layout="vertical" onFinish={handleMerge}>
          <Form.Item name="targetGroupId" label="合并到（目标群组）" rules={[{ required: true, message: '请选择目标群组' }]}>
            <Select placeholder="选择目标群组" showSearch filterOption={(input, option) =>
              option.children?.toLowerCase().includes(input.toLowerCase())
            }>
              {mergeTargetGroups.map(g => (
                <Option key={g.id} value={g.id}>{g.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" danger htmlType="submit">确认合并</Button>
              <Button onClick={() => setMergeModal({ open: false, group: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 群组数据统计 */}
      <Modal
        title={`群组数据 — ${statsModal.group?.name}`}
        open={statsModal.open}
        onCancel={() => setStatsModal({ open: false, group: null })}
        footer={null}
        width={960}
      >
        <Space style={{ marginBottom: 16 }}>
          <span>查看月份：</span>
          <DatePicker
            picker="month"
            value={summaryMonth}
            onChange={handleMonthChange}
            allowClear={false}
          />
          <span style={{ color: '#999', fontSize: 12 }}>（成本按该月单月计算）</span>
        </Space>

        {summary && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Statistic title="客户总数" value={summary.customerCount} /></Col>
            <Col span={6}><Statistic title={`${summaryMonth?.format('M')}月入金`} value={summary.totalDepositUsd} prefix="$" precision={2} valueStyle={{ color: '#3f8600' }} /></Col>
            <Col span={6}><Statistic title="群组月成本" value={summary.groupCost} prefix="$" precision={0} valueStyle={{ color: '#cf1322' }} /></Col>
            <Col span={6}><Statistic title="净利润" value={summary.netProfit} prefix="$" precision={2} valueStyle={{ color: summary.netProfit >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
          </Row>
        )}

        {dailyStatsAgg && (
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={16}>
              <Col span={4}><Statistic title="最新总人数" value={dailyStatsAgg.latestTotal} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={4}><Statistic title="真实客户" value={dailyStatsAgg.latestReal} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={4}><Statistic title="累计退群" value={dailyStatsAgg.totalExits} valueStyle={{ fontSize: 18, color: '#cf1322' }} suffix={<span style={{ fontSize: 12, color: '#999' }}>({dailyStatsAgg.exitRate}%)</span>} /></Col>
              <Col span={4}><Statistic title="累计看群" value={dailyStatsAgg.totalViewers} valueStyle={{ fontSize: 18 }} /></Col>
              <Col span={4}><Statistic title="累计咨询" value={dailyStatsAgg.totalInquiries} valueStyle={{ fontSize: 18, color: '#1677ff' }} suffix={<span style={{ fontSize: 12, color: '#999' }}>({dailyStatsAgg.inquiryRate}%)</span>} /></Col>
              <Col span={4}><Statistic title="累计成交" value={dailyStatsAgg.totalConversions} valueStyle={{ fontSize: 18, color: '#3f8600' }} suffix={<span style={{ fontSize: 12, color: '#999' }}>({dailyStatsAgg.conversionRate}%)</span>} /></Col>
            </Row>
          </Card>
        )}

        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddStatsModal({ open: true, groupId: statsModal.group?.id })} style={{ marginBottom: 16 }}>
          录入今日数据
        </Button>
        <Table columns={statColumns} dataSource={statsData} rowKey="id" size="small" pagination={false} />
      </Modal>

      {/* 录入每日数据 */}
      <Modal title="录入每日数据" open={addStatsModal.open} onCancel={() => setAddStatsModal({ open: false, groupId: null })} footer={null}>
        <Form form={statsForm} layout="vertical" onFinish={handleAddStats}>
          <Form.Item name="date" label="日期" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="totalMembers" label="总人数" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="realCustomers" label="真实客户" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="ownAccounts" label="自己账号" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="dailyExits" label="退群人数" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="viewers" label="看群人数" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="inquiries" label="咨询人数" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="conversions" label="成交人数" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="depositUsd" label="入金金额(USD)" initialValue={0}><InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="$" /></Form.Item></Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setAddStatsModal({ open: false, groupId: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
