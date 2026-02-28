const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../socket');

const router = express.Router();
const prisma = new PrismaClient();

// 获取翻译任务列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    let where = {};

    if (status) where.status = status;

    // 翻译角色看所有待处理任务；普通用户看自己发起的
    if (req.user.role !== 'TRANSLATOR') {
      where.requesterId = req.user.id;
    }

    const total = await prisma.translationTask.count({ where });
    const tasks = await prisma.translationTask.findMany({
      where,
      include: {
        requester: { select: { id: true, displayName: true, username: true } },
        customer: { select: { id: true, name: true, phone: true, uid: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize)
    });

    res.json({ total, data: tasks });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 发起翻译请求（需指定翻译员）
router.post('/', authenticate, async (req, res) => {
  try {
    const { content, customerId, translatorId } = req.body;
    if (!content) return res.status(400).json({ message: '翻译内容不能为空' });
    if (!translatorId) return res.status(400).json({ message: '请选择翻译员' });

    const task = await prisma.translationTask.create({
      data: {
        requesterId: req.user.id,
        customerId: customerId ? parseInt(customerId) : null,
        content
      },
      include: {
        requester: { select: { id: true, displayName: true } },
        customer: { select: { id: true, name: true } }
      }
    });

    // 只通知指定翻译员
    const io = req.app.get('io');
    const notif = await prisma.notification.create({
      data: {
        userId: parseInt(translatorId),
        type: 'TRANSLATION_PUSH',
        title: '新翻译任务',
        content: `${req.user.displayName || req.user.username} 指定你处理翻译请求`,
        relatedId: task.id
      }
    });
    sendNotification(io, parseInt(translatorId), notif);

    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 完成翻译任务（翻译角色）
router.put('/:id/complete', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'TRANSLATOR') {
      return res.status(403).json({ message: '只有翻译账号可以完成任务' });
    }

    const id = parseInt(req.params.id);
    const { result } = req.body;
    if (!result) return res.status(400).json({ message: '翻译结果不能为空' });

    const task = await prisma.translationTask.update({
      where: { id },
      data: { result, status: 'COMPLETED', completedAt: new Date() },
      include: { requester: true }
    });

    // 通知发起人
    const io = req.app.get('io');
    const notif = await prisma.notification.create({
      data: {
        userId: task.requesterId,
        type: 'TRANSLATION_DONE',
        title: '翻译任务已完成',
        content: `你的翻译请求已完成，请查看结果`,
        relatedId: task.id
      }
    });
    sendNotification(io, task.requesterId, notif);

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 翻译主动推送消息（支持指定用户 or 全部非翻译用户）
router.post('/push', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'TRANSLATOR') {
      return res.status(403).json({ message: '只有翻译账号可以主动推送' });
    }

    const { targetUserIds, pushAll, content, customerId } = req.body;
    if (!content) return res.status(400).json({ message: '内容不能为空' });

    let finalUserIds = [];
    if (pushAll) {
      // 推送给所有活跃的非翻译用户
      const allUsers = await prisma.user.findMany({
        where: { isActive: true, role: { not: 'TRANSLATOR' } },
        select: { id: true }
      });
      finalUserIds = allUsers.map(u => u.id);
    } else {
      if (!targetUserIds || targetUserIds.length === 0) {
        return res.status(400).json({ message: '请选择接收人或选择全部推送' });
      }
      finalUserIds = targetUserIds.map(id => parseInt(id));
    }

    const io = req.app.get('io');
    for (const userId of finalUserIds) {
      const notif = await prisma.notification.create({
        data: {
          userId,
          type: 'TRANSLATION_PUSH',
          title: '翻译推送消息',
          content: `翻译: ${content}`,
          relatedId: customerId ? parseInt(customerId) : null
        }
      });
      sendNotification(io, userId, notif);
    }

    res.json({ message: `消息已推送给 ${finalUserIds.length} 人` });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 翻译搜索客户（通过电话号码）
router.get('/search-customer', authenticate, async (req, res) => {
  try {
    if (!['TRANSLATOR', 'SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ message: '请输入电话号码' });

    const customers = await prisma.customer.findMany({
      where: { phone: { contains: phone } },
      include: {
        currentGroup: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } }
      },
      take: 10
    });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
