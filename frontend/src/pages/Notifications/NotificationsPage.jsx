import React, { useState, useEffect } from 'react'
import { Card, List, Badge, Button, Space, Tag, Typography, Empty, message } from 'antd'
import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { notificationApi } from '../../api'

const { Text } = Typography

const TYPE_LABELS = {
  RENEWAL_REMINDER: { label: '续费提醒', color: 'orange' },
  SUPERVISOR_COMMENT: { label: '主管建议', color: 'red' },
  LEADER_COMMENT: { label: '组长建议', color: 'blue' },
  COMMENT_RESPONSE: { label: '建议回应', color: 'green' },
  TRANSLATION_DONE: { label: '翻译完成', color: 'cyan' },
  TRANSLATION_PUSH: { label: '翻译推送', color: 'purple' }
}

// 点击这些类型时跳转到客户详情（前提：有 customerId）
const NAVIGATE_TYPES = ['SUPERVISOR_COMMENT', 'LEADER_COMMENT', 'COMMENT_RESPONSE', 'TRANSLATION_DONE', 'TRANSLATION_PUSH']

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ data: [], total: 0, unreadCount: 0 })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState(undefined)

  const load = () => {
    setLoading(true)
    notificationApi.list({ isRead: filter, pageSize: 50 })
      .then(setData)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const markRead = async (id) => {
    await notificationApi.markRead(id)
    load()
  }

  const markAllRead = async () => {
    await notificationApi.markAllRead()
    message.success('已全部标记为已读')
    load()
  }

  const handleItemClick = async (item) => {
    // 点击建议类通知：标记已读并跳转到客户详情
    if (NAVIGATE_TYPES.includes(item.type) && item.customerId) {
      if (!item.isRead) {
        await notificationApi.markRead(item.id)
      }
      navigate(`/customers/${item.customerId}`)
    } else if (!item.isRead) {
      markRead(item.id)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <BellOutlined />
            通知中心
            {data.unreadCount > 0 && <Badge count={data.unreadCount} />}
          </Space>
        }
        extra={
          <Space>
            <Button.Group>
              <Button type={filter === undefined ? 'primary' : 'default'} onClick={() => setFilter(undefined)}>全部</Button>
              <Button type={filter === 'false' ? 'primary' : 'default'} onClick={() => setFilter('false')}>未读</Button>
              <Button type={filter === 'true' ? 'primary' : 'default'} onClick={() => setFilter('true')}>已读</Button>
            </Button.Group>
            {data.unreadCount > 0 && (
              <Button icon={<CheckOutlined />} onClick={markAllRead}>全部已读</Button>
            )}
          </Space>
        }
      >
        {data.data.length === 0 ? <Empty description="暂无通知" /> : (
          <List
            dataSource={data.data}
            renderItem={item => {
              const typeInfo = TYPE_LABELS[item.type] || { label: item.type, color: 'default' }
              const isClickable = NAVIGATE_TYPES.includes(item.type) && item.customerId
              return (
                <List.Item
                  style={{
                    background: item.isRead ? '#fff' : '#f0f7ff',
                    padding: '12px 16px',
                    borderRadius: 6,
                    marginBottom: 8,
                    border: '1px solid',
                    borderColor: item.isRead ? '#f0f0f0' : '#d6e4ff',
                    cursor: isClickable ? 'pointer' : 'default'
                  }}
                  onClick={() => handleItemClick(item)}
                  actions={[
                    !item.isRead && (
                      <Button size="small" icon={<CheckOutlined />} onClick={e => { e.stopPropagation(); markRead(item.id) }}>已读</Button>
                    )
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
                        <Text strong={!item.isRead}>{item.title}</Text>
                        {!item.isRead && <Badge status="processing" />}
                        {isClickable && <Text type="secondary" style={{ fontSize: 12, color: '#1677ff' }}>（点击查看客户详情）</Text>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">{item.content}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>
    </div>
  )
}
