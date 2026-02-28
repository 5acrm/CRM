import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, Badge, message, Tabs, Popconfirm, Divider } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons'
import { userApi } from '../../api'
import { ROLE_LABELS, ROLE_WEIGHT } from '../../store/auth'
import useAuthStore from '../../store/auth'

const { Option } = Select

export default function AdminPage() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState({ open: false, user: null })
  const [pwdModal, setPwdModal] = useState({ open: false, user: null })
  const [deptModal, setDeptModal] = useState(false)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [deptForm] = Form.useForm()

  const isAdmin = ROLE_WEIGHT[currentUser.role] >= ROLE_WEIGHT['ADMIN']
  const isSupervisor = currentUser.role === 'SUPERVISOR'
  const isTeamLeader = currentUser.role === 'TEAM_LEADER'

  // 当前用户可创建/编辑的角色范围
  const getAllowedRoles = () => {
    if (isAdmin) return Object.entries(ROLE_LABELS).filter(([k]) => k !== 'SUPER_ADMIN')
    if (isSupervisor) return Object.entries(ROLE_LABELS).filter(([k]) => ['TEAM_LEADER', 'MEMBER'].includes(k))
    if (isTeamLeader) return Object.entries(ROLE_LABELS).filter(([k]) => k === 'MEMBER')
    return []
  }

  const load = () => {
    setLoading(true)
    const tasks = [userApi.list()]
    if (isAdmin) tasks.push(userApi.departments())
    Promise.all(tasks)
      .then(([u, d]) => { setUsers(u); if (d) setDepartments(d) })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (vals) => {
    try {
      await userApi.create(vals)
      message.success('用户创建成功')
      setCreateModal(false)
      form.resetFields()
      load()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const handleEdit = async (vals) => {
    try {
      await userApi.update(editModal.user.id, vals)
      message.success('用户已更新')
      setEditModal({ open: false, user: null })
      load()
    } catch (err) { message.error(err.message || '更新失败') }
  }

  const handleChangePwd = async (vals) => {
    try {
      await userApi.update(pwdModal.user.id, { password: vals.password })
      message.success('密码已修改')
      setPwdModal({ open: false, user: null })
      pwdForm.resetFields()
    } catch (err) { message.error(err.message || '修改失败') }
  }

  const handleDeleteUser = async (id) => {
    try {
      await userApi.delete(id)
      message.success('用户已删除')
      load()
    } catch (err) { message.error(err.message || '删除失败') }
  }

  const handleCreateDept = async (vals) => {
    try {
      await userApi.createDepartment(vals)
      message.success('部门创建成功')
      setDeptModal(false)
      deptForm.resetFields()
      load()
    } catch (err) { message.error(err.message || '创建失败') }
  }

  const handleDeleteDept = async (id) => {
    try {
      await userApi.deleteDepartment(id)
      message.success('部门已删除')
      load()
    } catch (err) { message.error(err.message || '删除失败') }
  }

  const openEdit = (u) => {
    editForm.setFieldsValue({
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      departmentId: u.departmentId,
      superiorId: u.superiorId,
      groupNumber: u.groupNumber ?? undefined,
      isActive: u.isActive
    })
    setEditModal({ open: true, user: u })
  }

  const UserForm = ({ form, onFinish, isEdit = false }) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      {!isEdit && (
        <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
      )}
      <Form.Item name="displayName" label="显示名称"><Input /></Form.Item>
      <Form.Item name="email" label="邮箱"><Input /></Form.Item>
      <Form.Item name="role" label="角色" rules={[{ required: true }]}>
        <Select>
          {getAllowedRoles().map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
        </Select>
      </Form.Item>
      {isAdmin && (
        <>
          <Form.Item name="departmentId" label="所属部门">
            <Select placeholder="选择部门" allowClear>
              {departments.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="groupNumber" label="小组编号">
            <Select placeholder="选择小组" allowClear>
              {[1,2,3,4,5,6,7,8,9,10].map(n => <Option key={n} value={n}>{n}组</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="superiorId" label="上级">
            <Select placeholder="选择上级" allowClear showSearch filterOption={(input, option) => option.children?.toLowerCase().includes(input.toLowerCase())}>
              {users.filter(u => u.id !== editModal.user?.id).map(u => (
                <Option key={u.id} value={u.id}>{u.displayName || u.username} ({ROLE_LABELS[u.role]})</Option>
              ))}
            </Select>
          </Form.Item>
        </>
      )}
      {isEdit && (
        <Form.Item name="isActive" label="账号状态">
          <Select>
            <Option value={true}>正常</Option>
            <Option value={false}>禁用</Option>
          </Select>
        </Form.Item>
      )}
      {!isEdit && (
        <Form.Item name="password" label="密码" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
      )}
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">保存</Button>
          <Button onClick={() => { setCreateModal(false); setEditModal({ open: false, user: null }) }}>取消</Button>
        </Space>
      </Form.Item>
    </Form>
  )

  const columns = [
    { title: '用户名', dataIndex: 'username' },
    { title: '显示名称', dataIndex: 'displayName', render: v => v || '-' },
    { title: '角色', dataIndex: 'role', render: v => <Tag color="blue">{ROLE_LABELS[v] || v}</Tag> },
    { title: '部门', dataIndex: 'department', render: d => d?.name || '-' },
    { title: '小组', dataIndex: 'groupNumber', render: v => v ? <Tag color="cyan">{v}组</Tag> : '-' },
    { title: '上级', dataIndex: 'superior', render: u => u?.displayName || '-' },
    { title: '状态', dataIndex: 'isActive', render: v => v ? <Badge status="success" text="正常" /> : <Badge status="error" text="禁用" /> },
    {
      title: '操作',
      render: (_, u) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(u)}>编辑</Button>
          <Button size="small" icon={<KeyOutlined />} onClick={() => { setPwdModal({ open: true, user: u }); pwdForm.resetFields() }}>改密码</Button>
          {isAdmin && u.id !== currentUser.id && (
            <Popconfirm
              title="确认删除该用户？"
              description="若有关联数据则无法删除，可改为禁用。"
              onConfirm={() => handleDeleteUser(u.id)}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  const deptColumns = [
    { title: '部门名称', dataIndex: 'name' },
    {
      title: '操作',
      render: (_, d) => (
        <Popconfirm
          title="确认删除该部门？"
          description="部门下有用户时无法删除。"
          onConfirm={() => handleDeleteDept(d.id)}
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
        >
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      )
    }
  ]

  const tabItems = [
    {
      key: 'users',
      label: '用户管理',
      children: (
        <Card
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>新建用户</Button>}
        >
          <Table columns={columns} dataSource={users} rowKey="id" loading={loading} />
        </Card>
      )
    },
    ...(isAdmin ? [{
      key: 'departments',
      label: '部门管理',
      children: (
        <Card extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setDeptModal(true)}>新建部门</Button>}>
          <Table dataSource={departments} rowKey="id" columns={deptColumns} />
        </Card>
      )
    }] : [])
  ]

  return (
    <div style={{ padding: 24 }}>
      <Tabs items={tabItems} />

      <Modal title="新建用户" open={createModal} onCancel={() => setCreateModal(false)} footer={null} width={600}>
        <UserForm form={form} onFinish={handleCreate} isEdit={false} />
      </Modal>

      <Modal title="编辑用户" open={editModal.open} onCancel={() => setEditModal({ open: false, user: null })} footer={null} width={600}>
        <UserForm form={editForm} onFinish={handleEdit} isEdit={true} />
      </Modal>

      <Modal
        title={`修改密码 — ${pwdModal.user?.displayName || pwdModal.user?.username || ''}`}
        open={pwdModal.open}
        onCancel={() => { setPwdModal({ open: false, user: null }); pwdForm.resetFields() }}
        footer={null}
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePwd} style={{ marginTop: 16 }}>
          <Form.Item name="password" label="新密码" rules={[{ required: true }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm" label="确认新密码" rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve()
                return Promise.reject(new Error('两次密码不一致'))
              }
            })
          ]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">确认修改</Button>
              <Button onClick={() => { setPwdModal({ open: false, user: null }); pwdForm.resetFields() }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {isAdmin && (
        <Modal title="新建部门" open={deptModal} onCancel={() => setDeptModal(false)} footer={null}>
          <Form form={deptForm} layout="vertical" onFinish={handleCreateDept}>
            <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">创建</Button>
                <Button onClick={() => setDeptModal(false)}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  )
}
