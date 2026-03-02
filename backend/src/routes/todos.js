const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET / - 待办列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { showCompleted, page = 1, pageSize = 20 } = req.query;
    const where = { userId: req.user.id };

    if (showCompleted !== 'true') {
      where.isCompleted = false;
    }

    // 默认显示当天及未来的待办
    if (showCompleted !== 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      where.OR = [
        { dueDate: { gte: todayStart } },
        { dueDate: null }
      ];
    }

    const [total, data] = await Promise.all([
      prisma.todoItem.count({ where }),
      prisma.todoItem.findMany({
        where,
        include: {
          relatedCustomer: { select: { id: true, name: true, phone: true } }
        },
        orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
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

// POST / - 创建待办
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, dueDate, relatedCustomerId } = req.body;
    if (!title) return res.status(400).json({ message: '请填写事件标题' });

    const todo = await prisma.todoItem.create({
      data: {
        userId: req.user.id,
        title,
        content,
        dueDate: dueDate ? new Date(dueDate) : null,
        type: 'MANUAL',
        relatedCustomerId: relatedCustomerId ? parseInt(relatedCustomerId) : null
      },
      include: {
        relatedCustomer: { select: { id: true, name: true, phone: true } }
      }
    });
    res.json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /:id - 修改待办
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(403).json({ message: '无权操作' });
    }

    const { title, content, dueDate } = req.body;
    const todo = await prisma.todoItem.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null })
      }
    });
    res.json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /:id/complete - 切换完成状态
router.put('/:id/complete', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(403).json({ message: '无权操作' });
    }

    const todo = await prisma.todoItem.update({
      where: { id },
      data: { isCompleted: !existing.isCompleted }
    });
    res.json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// DELETE /:id - 删除待办
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(403).json({ message: '无权操作' });
    }

    await prisma.todoItem.delete({ where: { id } });
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
