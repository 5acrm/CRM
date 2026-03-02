import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Tag, Space, message, Checkbox, Popconfirm, Segmented } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { todoApi } from '../../api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { TextArea } = Input;

const TYPE_MAP = {
  MANUAL: { color: 'blue', label: '手动' },
  FOLLOWUP_REMINDER: { color: 'orange', label: '跟进提醒' },
};

export default function TodosPage() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [showCompleted, setShowCompleted] = useState('pending'); // 'pending' | 'all'
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await todoApi.list({
        showCompleted: showCompleted === 'all' ? 'true' : 'false',
        page,
        pageSize,
      });
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('加载待办事项失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, showCompleted]);

  const handleToggleComplete = async (record) => {
    try {
      await todoApi.complete(record.id);
      message.success(record.isCompleted ? '已标记为未完成' : '已完成');
      fetchData();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await todoApi.delete(id);
      message.success('删除成功');
      fetchData();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      title: record.title,
      content: record.content || '',
      dueDate: record.dueDate ? dayjs(record.dueDate) : null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        title: values.title,
        content: values.content || '',
        dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      };

      if (editingItem) {
        await todoApi.update(editingItem.id, payload);
        message.success('修改成功');
      } else {
        await todoApi.create(payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchData();
    } catch {
      // form validation error or api error
    }
  };

  const isOverdue = (record) => {
    return record.dueDate && !record.isCompleted && dayjs(record.dueDate).isBefore(dayjs());
  };

  const columns = [
    {
      title: '',
      dataIndex: 'isCompleted',
      width: 50,
      render: (val, record) => (
        <Checkbox
          checked={val}
          onChange={() => handleToggleComplete(record)}
        />
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (text, record) => (
        <span style={{
          textDecoration: record.isCompleted ? 'line-through' : 'none',
          color: record.isCompleted ? '#999' : undefined,
        }}>
          {text}
        </span>
      ),
    },
    {
      title: '截止时间',
      dataIndex: 'dueDate',
      width: 180,
      render: (val, record) => {
        if (!val) return '-';
        const overdue = isOverdue(record);
        return (
          <span style={{ color: overdue ? '#ff4d4f' : undefined, fontWeight: overdue ? 'bold' : undefined }}>
            {dayjs(val).format('YYYY-MM-DD HH:mm')}
          </span>
        );
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (val) => {
        const t = TYPE_MAP[val] || { color: 'default', label: val };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '关联客户',
      dataIndex: 'relatedCustomer',
      width: 150,
      render: (customer) => {
        if (!customer) return '-';
        return (
          <a onClick={() => navigate(`/customers/${customer.id}`)}>
            {customer.name}{customer.phone ? ` (${customer.phone})` : ''}
          </a>
        );
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>待办事项</h2>
        <Space>
          <Segmented
            value={showCompleted}
            onChange={(val) => { setShowCompleted(val); setPage(1); }}
            options={[
              { label: '待完成', value: 'pending' },
              { label: '全部', value: 'all' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            新增
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => setPage(p),
          showTotal: (t) => `共 ${t} 条`,
        }}
        rowClassName={(record) => record.isCompleted ? 'todo-completed-row' : ''}
      />

      <Modal
        title={editingItem ? '编辑待办' : '新增待办'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="title"
            label="事件标题"
            rules={[{ required: true, message: '请填写事件标题' }]}
          >
            <Input placeholder="请输入待办事项标题" />
          </Form.Item>
          <Form.Item name="content" label="详细内容">
            <TextArea rows={3} placeholder="可选，填写详细内容" />
          </Form.Item>
          <Form.Item name="dueDate" label="截止时间">
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .todo-completed-row {
          opacity: 0.5;
          background: #fafafa !important;
        }
      `}</style>
    </div>
  );
}
