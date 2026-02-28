const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 获取我的通知
router.get('/', authenticate, async (req, res) => {
  try {
    const { isRead, page = 1, pageSize = 20 } = req.query;
    const where = { userId: req.user.id };
    if (isRead !== undefined) where.isRead = isRead === 'true';

    const total = await prisma.notification.count({ where });
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize)
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false }
    });

    // 为建议类通知附加 customerId（通过 comment → record → customer）
    const commentTypes = ['SUPERVISOR_COMMENT', 'LEADER_COMMENT', 'COMMENT_RESPONSE'];
    const commentNotifs = notifications.filter(n => commentTypes.includes(n.type) && n.relatedId);
    if (commentNotifs.length > 0) {
      const commentIds = commentNotifs.map(n => n.relatedId);
      const comments = await prisma.followUpComment.findMany({
        where: { id: { in: commentIds } },
        include: { record: { select: { customerId: true } } }
      });
      const commentMap = {};
      comments.forEach(c => { commentMap[c.id] = c.record?.customerId; });
      notifications.forEach(n => {
        if (commentTypes.includes(n.type) && n.relatedId) {
          n.customerId = commentMap[n.relatedId] || null;
        }
      });
    }

    // 为翻译完成通知附加 customerId（通过 task.id → task.customerId）
    const txDoneNotifs = notifications.filter(n => n.type === 'TRANSLATION_DONE' && n.relatedId);
    if (txDoneNotifs.length > 0) {
      const taskIds = txDoneNotifs.map(n => n.relatedId);
      const tasks = await prisma.translationTask.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, customerId: true }
      });
      const taskMap = {};
      tasks.forEach(t => { taskMap[t.id] = t.customerId; });
      notifications.forEach(n => {
        if (n.type === 'TRANSLATION_DONE' && n.relatedId) {
          n.customerId = taskMap[n.relatedId] || null;
        }
      });
    }

    // 翻译推送：relatedId 本身就是 customerId
    notifications.forEach(n => {
      if (n.type === 'TRANSLATION_PUSH' && n.relatedId) {
        n.customerId = n.relatedId;
      }
    });

    res.json({ total, unreadCount, data: notifications });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 标记已读
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.notification.update({
      where: { id, userId: req.user.id },
      data: { isRead: true }
    });
    res.json({ message: '已标记为已读' });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 全部标记已读
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ message: '已全部标记为已读' });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
