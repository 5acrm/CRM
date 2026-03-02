const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET / - 营销智库列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { keyword, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const [total, data] = await Promise.all([
      prisma.marketingArticle.count({ where }),
      prisma.marketingArticle.findMany({
        where,
        include: { user: { select: { id: true, displayName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(pageSize),
        take: parseInt(pageSize)
      })
    ]);

    res.json({ total, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// GET /:id - 详情
router.get('/:id', authenticate, async (req, res) => {
  try {
    const article = await prisma.marketingArticle.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { user: { select: { id: true, displayName: true, username: true } } }
    });
    if (!article) return res.status(404).json({ message: '文章不存在' });
    res.json(article);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// POST / - 创建
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, images } = req.body;
    if (!title || !content) return res.status(400).json({ message: '请填写主题和内容' });

    const article = await prisma.marketingArticle.create({
      data: {
        title,
        content,
        images: Array.isArray(images) ? JSON.stringify(images) : (images || null),
        userId: req.user.id
      },
      include: { user: { select: { id: true, displayName: true, username: true } } }
    });
    res.json(article);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /:id - 修改
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, content, images } = req.body;

    const article = await prisma.marketingArticle.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(images !== undefined && { images: Array.isArray(images) ? JSON.stringify(images) : images })
      },
      include: { user: { select: { id: true, displayName: true, username: true } } }
    });
    res.json(article);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// DELETE /:id - 删除
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.marketingArticle.delete({ where: { id } });
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
