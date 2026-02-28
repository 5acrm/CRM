import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Tabs, Descriptions, Tag, Button, Space, Modal, Form, Input, Select,
  Timeline, List, Avatar, Typography, Divider, Row, Col, Statistic, message,
  Badge, Tooltip, Table
} from 'antd'
import {
  ArrowLeftOutlined, EditOutlined, PlusOutlined, MessageOutlined,
  PhoneOutlined, VideoCameraOutlined, SwapOutlined, UserOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { customerApi, followUpApi, transactionApi, groupApi, accountApi } from '../../api'
import useAuthStore, { WA_ROLE_LABELS, CONTACT_TYPE_LABELS, ROLE_WEIGHT, CURRENCY_LABELS } from '../../store/auth'

const { Option } = Select
const { TextArea } = Input
const { Text } = Typography

const FOLLOW_UP_STATUS_OPTIONS = ['初次接触', '有意向', '深度跟进', '报价阶段', '已成交', '暂时搁置', '已流失']

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [customer, setCustomer] = useState(null)
  const [followUps, setFollowUps] = useState([])
  const [transactions, setTransactions] = useState([])
  const [financeSummary, setFinanceSummary] = useState(null)
  const [groups, setGroups] = useState([])
  const [myAccounts, setMyAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  // 模态框状态
  const [followUpModal, setFollowUpModal] = useState(false)
  const [commentModal, setCommentModal] = useState({ open: false, recordId: null })
  const [moveModal, setMoveModal] = useState(false)
  const [txModal, setTxModal] = useState(false)
  const [editModal, setEditModal] = useState(false)

  const [followUpForm] = Form.useForm()
  const [commentForm] = Form.useForm()
  const [moveForm] = Form.useForm()
  const [txForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const canMoveCustomer = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']
  const canComment = ROLE_WEIGHT[user.role] >= ROLE_WEIGHT['TEAM_LEADER']

  const load = () => {
    Promise.all([
      customerApi.get(id),
      followUpApi.listByCustomer(id),
      transactionApi.list({ customerId: id }),
      customerApi.financeSummary(id),
      groupApi.list(),
      accountApi.mine()
    ]).then(([c, f, tx, fs, g, acc]) => {
      setCustomer(c)
      setFollowUps(f)
      setTransactions(tx.data || [])
      setFinanceSummary(fs)
      setGroups(g)
      setMyAccounts(acc)
    }).catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleCreateFollowUp = async (vals) => {
    try {
      await followUpApi.create({ ...vals, customerId: parseInt(id) })
      message.success('跟进记录已添加')
      setFollowUpModal(false)
      followUpForm.resetFields()
      followUpApi.listByCustomer(id).then(setFollowUps)
    } catch (err) { message.error(err.message || '添加失败') }
  }

  const handleAddComment = async (vals) => {
    try {
      await followUpApi.addComment(commentModal.recordId, vals)
      message.success('建议已添加')
      setCommentModal({ open: false, recordId: null })
      commentForm.resetFields()
      followUpApi.listByCustomer(id).then(setFollowUps)
    } catch (err) { message.error(err.message || '添加失败') }
  }

  const handleMoveGroup = async (vals) => {
    try {
      await customerApi.moveGroup(id, { newGroupId: vals.groupId })
      message.success('客户已移动到新群组')
      setMoveModal(false)
      customerApi.get(id).then(setCustomer)
    } catch (err) { message.error(err.message || '移动失败') }
  }

  const handleAddTransaction = async (vals) => {
    try {
      await transactionApi.create({ ...vals, customerId: parseInt(id) })
      message.success('记录已添加')
      setTxModal(false)
      txForm.resetFields()
      Promise.all([
        transactionApi.list({ customerId: id }),
        customerApi.financeSummary(id)
      ]).then(([tx, fs]) => { setTransactions(tx.data || []); setFinanceSummary(fs) })
    } catch (err) { message.error(err.message || '添加失败') }
  }

  const handleEdit = async (vals) => {
    try {
      await customerApi.update(id, vals)
      message.success('客户信息已更新')
      setEditModal(false)
      customerApi.get(id).then(setCustomer)
    } catch (err) { message.error(err.message || '更新失败') }
  }

  const contactTypeIcon = (type) => {
    if (type === 'CALL') return <PhoneOutlined style={{ color: '#52c41a' }} />
    if (type === 'VIDEO') return <VideoCameraOutlined style={{ color: '#1677ff' }} />
    return <MessageOutlined style={{ color: '#8c8c8c' }} />
  }

  if (loading) return <div style={{ padding: 24 }}>加载中...</div>
  if (!customer) return <div style={{ padding: 24 }}>客户不存在</div>

  const txColumns = [
    { title: '类型', dataIndex: 'type', render: v => <Tag color={v === 'DEPOSIT' ? 'green' : 'red'}>{v === 'DEPOSIT' ? '入金' : '出金'}</Tag> },
    { title: '币种', dataIndex: 'currency' },
    { title: '数量', dataIndex: 'amount' },
    { title: 'USD金额', dataIndex: 'usdAmount', render: v => `$${v?.toFixed(2)}` },
    { title: '汇率', dataIndex: 'rateAtTime', render: v => v === 1 ? '-' : `$${v?.toFixed(2)}` },
    { title: '备注', dataIndex: 'note', render: v => v || '-' },
    { title: '时间', dataIndex: 'recordedAt', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') }
  ]

  return (
    <div style={{ padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')} style={{ marginBottom: 16 }}>
        返回列表
      </Button>

      <Card
        title={
          <Space>
            <UserOutlined />
            <span>{customer.name}</span>
            {customer.followUpStatus && <Tag>{customer.followUpStatus}</Tag>}
            {customer.hasMiningAuth && <Tag color="gold">已授权矿池</Tag>}
          </Space>
        }
        extra={
          <Space>
            {canMoveCustomer && (
              <Button icon={<SwapOutlined />} onClick={() => setMoveModal(true)}>移动群组</Button>
            )}
            <Button icon={<EditOutlined />} onClick={() => {
              editForm.setFieldsValue({
                name: customer.name, uid: customer.uid, email: customer.email,
                phone: customer.phone, followUpStatus: customer.followUpStatus,
                hasMiningAuth: customer.hasMiningAuth,
                miningWalletName: customer.miningWalletName,
                miningWalletAddress: customer.miningWalletAddress,
                isRegistered: customer.isRegistered,
                isRealName: customer.isRealName,
                waAccountIds: customer.waAccountLinks?.map(l => l.waAccountId) ?? []
              })
              setEditModal(true)
            }}>编辑</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {/* 同时跟进人员标注 */}
        {customer.followers?.length > 0 && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fffbe6', borderRadius: 6, border: '1px solid #ffe58f' }}>
            <Text strong>同时跟进：</Text>
            <Space wrap style={{ marginTop: 4 }}>
              {customer.followers.map(f => (
                <Tag key={f.id} color="orange">
                  {f.user?.displayName} {f.waRole ? `(${WA_ROLE_LABELS[f.waRole]})` : ''}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="UID">{customer.uid || '-'}</Descriptions.Item>
              <Descriptions.Item label="电话">{customer.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{customer.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="所在群组">
                {customer.currentGroup ? <Tag color="blue">{customer.currentGroup.name}</Tag> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">{customer.createdBy?.displayName || '-'}</Descriptions.Item>
              <Descriptions.Item label="关联WA账号">
                {customer.waAccountLinks?.length > 0
                  ? <Space size={2} wrap>{customer.waAccountLinks.map(l => {
                      const a = l.waAccount
                      return <Tag key={l.waAccountId} color="cyan">{a?.nickname ? `${a.nickname} ${a.phoneNumber}` : a?.phoneNumber}</Tag>
                    })}</Space>
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            {financeSummary && (
              <Row gutter={8}>
                <Col span={12}><Statistic title="入金总额" value={financeSummary.totalDepositUsd} prefix="$" precision={2} valueStyle={{ color: '#3f8600' }} /></Col>
                <Col span={12}><Statistic title="出金总额" value={financeSummary.totalWithdrawalUsd} prefix="$" precision={2} valueStyle={{ color: '#cf1322' }} /></Col>
              </Row>
            )}
            {/* 钱包信息 */}
            {customer.wallets?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong>加密钱包：</Text>
                {customer.wallets.map(w => (
                  <div key={w.id}><Tag>{w.currency}</Tag><Text copyable style={{ fontSize: 12 }}>{w.address}</Text></div>
                ))}
              </div>
            )}
            {/* 矿池授权信息 */}
            {customer.hasMiningAuth && (customer.miningWalletName || customer.miningWalletAddress) && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
                <Text strong style={{ color: '#d48806' }}>矿池授权：</Text>
                {customer.miningWalletName && <span> {customer.miningWalletName}</span>}
                {customer.miningWalletAddress && <Text copyable style={{ fontSize: 12, marginLeft: 8 }}>{customer.miningWalletAddress}</Text>}
              </div>
            )}
          </Col>
        </Row>

        {/* 群组历史 */}
        {customer.groupHistory?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              群组变更记录：{customer.groupHistory.map((h, i) => (
                <span key={h.id}>{i > 0 ? ' → ' : ''}{h.fromGroup?.name || '无'} → (由 {h.movedBy?.displayName} 于 {dayjs(h.movedAt).format('MM-DD')} 操作)</span>
              ))}
            </Text>
          </div>
        )}
      </Card>

      <Tabs defaultActiveKey="followup" items={[
        {
          key: 'followup',
          label: `跟进记录 (${followUps.length})`,
          children: (
            <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setFollowUpModal(true)}>添加跟进记录</Button>}>
              {followUps.length === 0 ? <div style={{ textAlign: 'center', color: '#999', padding: 32 }}>暂无跟进记录</div> : (
                <List
                  dataSource={followUps}
                  renderItem={record => (
                    <List.Item style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: '1px solid #f0f0f0', padding: '12px 0' }}>
                      <div style={{ width: '100%' }}>
                        <Space style={{ marginBottom: 8 }}>
                          {contactTypeIcon(record.contactType)}
                          <Text strong>{record.user?.displayName}</Text>
                          {record.waRole && <Tag color="purple">{WA_ROLE_LABELS[record.waRole] || record.waRole}</Tag>}
                          <Tag>{CONTACT_TYPE_LABELS[record.contactType]}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                        </Space>
                        <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 4, marginBottom: 8 }}>
                          {record.content}
                        </div>

                        {/* 建议列表 */}
                        {record.comments?.map(comment => (
                          <div key={comment.id} style={{ marginLeft: 24, marginBottom: 8 }}>
                            <div style={{ padding: '6px 10px', background: '#fff7e6', borderRadius: 4, borderLeft: '3px solid #fa8c16' }}>
                              <Text strong style={{ fontSize: 12, color: '#fa8c16' }}>
                                {comment.user?.displayName} 的建议：
                              </Text>
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
                        ))}

                        {canComment && (
                          <Button
                            size="small"
                            type="link"
                            onClick={() => setCommentModal({ open: true, recordId: record.id })}
                          >
                            添加建议
                          </Button>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Card>
          )
        },
        {
          key: 'transactions',
          label: `财务记录 (${transactions.length})`,
          children: (
            <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setTxModal(true)}>添加记录</Button>}>
              <Table columns={txColumns} dataSource={transactions} rowKey="id" size="small" pagination={false} />
            </Card>
          )
        }
      ]} />

      {/* 添加跟进记录 */}
      <Modal title="添加跟进记录" open={followUpModal} onCancel={() => setFollowUpModal(false)} footer={null}>
        <Form form={followUpForm} layout="vertical" onFinish={handleCreateFollowUp}>
          <Form.Item name="contactType" label="联系方式" initialValue="TEXT">
            <Select>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="waAccountId" label="使用账号">
            <Select placeholder="选择 WhatsApp 账号" allowClear>
              {myAccounts.map(a => (
                <Option key={a.id} value={a.id}>{a.nickname || a.phoneNumber} ({WA_ROLE_LABELS[a.role]})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="waRole" label="账号角色">
            <Select placeholder="跟进角色" allowClear>
              {Object.entries(WA_ROLE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请填写内容' }]}>
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交</Button>
              <Button onClick={() => setFollowUpModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加建议 */}
      <Modal title="添加建议" open={commentModal.open} onCancel={() => setCommentModal({ open: false, recordId: null })} footer={null}>
        <Form form={commentForm} layout="vertical" onFinish={handleAddComment}>
          <Form.Item name="content" label="建议内容" rules={[{ required: true }]}>
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交</Button>
              <Button onClick={() => setCommentModal({ open: false, recordId: null })}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 移动群组 */}
      <Modal title="移动到新群组" open={moveModal} onCancel={() => setMoveModal(false)} footer={null}>
        <Form form={moveForm} layout="vertical" onFinish={handleMoveGroup}>
          <Form.Item name="groupId" label="目标群组" rules={[{ required: true, message: '请选择群组' }]}>
            <Select>
              {groups.map(g => <Option key={g.id} value={g.id}>{g.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">确认移动</Button>
              <Button onClick={() => setMoveModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加入金/出金 */}
      <Modal title="添加财务记录" open={txModal} onCancel={() => setTxModal(false)} footer={null}>
        <Form form={txForm} layout="vertical" onFinish={handleAddTransaction}>
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="DEPOSIT">
            <Select>
              <Option value="DEPOSIT">入金</Option>
              <Option value="WITHDRAWAL">出金</Option>
            </Select>
          </Form.Item>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
            <Select>
              {Object.entries(CURRENCY_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="数量（枚）" rules={[{ required: true }]}>
            <Input type="number" step="0.00000001" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.currency !== c.currency}>
            {({ getFieldValue }) => ['BTC', 'ETH'].includes(getFieldValue('currency')) && (
              <Form.Item name="usdAmount" label="USD 金额（手动填写）" rules={[{ required: true, message: '请手动填写 USD 金额' }]}>
                <Input type="number" step="0.01" placeholder="请填写实际 USD 等值金额" prefix="$" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">提交</Button>
              <Button onClick={() => setTxModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑客户 */}
      <Modal title="编辑客户信息" open={editModal} onCancel={() => setEditModal(false)} footer={null} width={600}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="客户名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="uid" label="UID"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="followUpStatus" label="跟进状态">
                <Select allowClear>
                  {FOLLOW_UP_STATUS_OPTIONS.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="waAccountIds" label="关联WhatsApp账号">
                <Select mode="multiple" placeholder="选择关联账号（可多选）" allowClear>
                  {myAccounts.map(a => <Option key={a.id} value={a.id}>{a.nickname ? `${a.nickname} ${a.phoneNumber}` : a.phoneNumber} ({WA_ROLE_LABELS[a.role]})</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hasMiningAuth" label="授权矿池">
                <Select>
                  <Option value={false}>否</Option>
                  <Option value={true}>是</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isRegistered" label="是否注册">
                <Select><Option value={false}>否</Option><Option value={true}>是</Option></Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isRealName" label="是否实名">
                <Select><Option value={false}>否</Option><Option value={true}>是</Option></Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.hasMiningAuth !== c.hasMiningAuth}>
                {({ getFieldValue }) => getFieldValue('hasMiningAuth') && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="miningWalletName" label="矿池钱包名称">
                        <Input placeholder="钱包名称" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="miningWalletAddress" label="授权钱包地址">
                        <Input placeholder="钱包地址" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setEditModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
