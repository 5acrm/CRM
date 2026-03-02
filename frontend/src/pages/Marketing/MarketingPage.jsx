import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, message, Tag, Upload, Image, Popconfirm, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PictureOutlined } from '@ant-design/icons';
import { marketingApi } from '../../api';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

export default function MarketingPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [searchValue, setSearchValue] = useState('');

  // 创建/编辑弹窗
  const [editVisible, setEditVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailArticle, setDetailArticle] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await marketingApi.list({ keyword, page, pageSize });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, keyword]);

  const handleSearch = () => {
    setPage(1);
    setKeyword(searchValue);
  };

  // 打开新增弹窗
  const handleAdd = () => {
    setEditRecord(null);
    form.resetFields();
    setFileList([]);
    setEditVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = (record) => {
    setEditRecord(record);
    form.setFieldsValue({
      title: record.title,
      content: record.content,
    });
    // 回填图片
    if (record.images) {
      try {
        const imgs = JSON.parse(record.images);
        setFileList(imgs.map((url, i) => ({
          uid: `existing-${i}`,
          name: `图片${i + 1}`,
          status: 'done',
          url: url,
        })));
      } catch {
        setFileList([]);
      }
    } else {
      setFileList([]);
    }
    setEditVisible(true);
  };

  // 查看详情
  const handleView = async (record) => {
    setDetailLoading(true);
    setDetailVisible(true);
    try {
      const article = await marketingApi.get(record.id);
      setDetailArticle(article);
    } catch (err) {
      message.error(err?.message || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 删除
  const handleDelete = async (id) => {
    try {
      await marketingApi.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error(err?.message || '删除失败');
    }
  };

  // 图片上传前检查
  const beforeUpload = (file) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('只能上传图片文件');
      return Upload.LIST_IGNORE;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片不能超过 5MB');
      return Upload.LIST_IGNORE;
    }
    return false; // 阻止自动上传
  };

  const handleUploadChange = ({ fileList: newFileList }) => {
    // 最多 5 张图
    if (newFileList.length > 5) {
      message.warning('最多上传 5 张图片');
      return;
    }
    setFileList(newFileList);
  };

  // 将 fileList 转为 base64 数组
  const getBase64Images = () => {
    return Promise.all(
      fileList.map((file) => {
        return new Promise((resolve) => {
          if (file.url) {
            // 已有 base64（编辑回填的）
            resolve(file.url);
            return;
          }
          const reader = new FileReader();
          reader.readAsDataURL(file.originFileObj);
          reader.onload = () => resolve(reader.result);
        });
      })
    );
  };

  // 提交创建/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const images = await getBase64Images();
      const payload = {
        title: values.title,
        content: values.content,
        images: images.length > 0 ? JSON.stringify(images) : null,
      };

      if (editRecord) {
        await marketingApi.update(editRecord.id, payload);
        message.success('更新成功');
      } else {
        await marketingApi.create(payload);
        message.success('创建成功');
      }
      setEditVisible(false);
      fetchData();
    } catch (err) {
      if (err?.errorFields) return; // form validation error
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 解析图片数量
  const getImageCount = (images) => {
    if (!images) return 0;
    try {
      return JSON.parse(images).length;
    } catch {
      return 0;
    }
  };

  const columns = [
    {
      title: '主题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      ellipsis: true,
    },
    {
      title: '解决方案',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (text) => (
        <span style={{ color: '#666' }}>{text?.length > 80 ? text.slice(0, 80) + '...' : text}</span>
      ),
    },
    {
      title: '图片',
      dataIndex: 'images',
      key: 'images',
      width: 80,
      align: 'center',
      render: (images) => {
        const count = getImageCount(images);
        return count > 0 ? (
          <Tag icon={<PictureOutlined />} color="blue">{count}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: '创建人',
      dataIndex: 'user',
      key: 'user',
      width: 120,
      render: (user) => user?.displayName || user?.username || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此话术？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>营销智库</Title>
        <Space>
          <Input.Search
            placeholder="搜索主题/内容"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onSearch={handleSearch}
            allowClear
            style={{ width: 280 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增话术
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
          showSizeChanger: false,
        }}
      />

      {/* 创建/编辑弹窗 */}
      <Modal
        title={editRecord ? '编辑话术' : '新增话术'}
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="主题" rules={[{ required: true, message: '请输入主题' }]}>
            <Input placeholder="请输入话术主题" maxLength={200} />
          </Form.Item>
          <Form.Item name="content" label="解决方案" rules={[{ required: true, message: '请输入解决方案' }]}>
            <TextArea rows={8} placeholder="请输入话术内容/解决方案" maxLength={10000} showCount />
          </Form.Item>
          <Form.Item label="图片（最多 5 张，每张不超过 5MB）">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={handleUploadChange}
              beforeUpload={beforeUpload}
              accept="image/*"
              maxCount={5}
            >
              {fileList.length >= 5 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传图片</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="话术详情"
        open={detailVisible}
        onCancel={() => { setDetailVisible(false); setDetailArticle(null); }}
        footer={[
          <Button key="close" onClick={() => { setDetailVisible(false); setDetailArticle(null); }}>
            关闭
          </Button>
        ]}
        width={750}
        loading={detailLoading}
      >
        {detailArticle && (
          <div>
            <Title level={5}>{detailArticle.title}</Title>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">
                创建人：{detailArticle.user?.displayName || detailArticle.user?.username || '-'}
              </Text>
              <Text type="secondary" style={{ marginLeft: 16 }}>
                创建时间：{dayjs(detailArticle.createdAt).format('YYYY-MM-DD HH:mm')}
              </Text>
              {detailArticle.updatedAt && detailArticle.updatedAt !== detailArticle.createdAt && (
                <Text type="secondary" style={{ marginLeft: 16 }}>
                  更新时间：{dayjs(detailArticle.updatedAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              )}
            </div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {detailArticle.content}
              </Paragraph>
            </div>
            {detailArticle.images && (() => {
              try {
                const imgs = JSON.parse(detailArticle.images);
                if (imgs.length === 0) return null;
                return (
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>附件图片：</Text>
                    <Image.PreviewGroup>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {imgs.map((img, i) => (
                          <Image
                            key={i}
                            src={img}
                            width={200}
                            style={{ borderRadius: 4, border: '1px solid #d9d9d9' }}
                          />
                        ))}
                      </div>
                    </Image.PreviewGroup>
                  </div>
                );
              } catch {
                return null;
              }
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
