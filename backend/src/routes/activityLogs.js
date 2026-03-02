const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const ROLE_WEIGHT = { MEMBER: 1, TRANSLATOR: 1, TEAM_LEADER: 2, SUPERVISOR: 3, DEPT_MANAGER: 4, ADMIN: 5, SUPER_ADMIN: 6 };

// GET / - 操作日志列表（组长及以上可查看）
router.get('/', authenticate, async (req, res) => {
  try {
    // 仅组长及以上可查看
    if (ROLE_WEIGHT[req.user.role] < ROLE_WEIGHT['TEAM_LEADER']) {
      return res.status(403).json({ message: '权限不足' });
    }

    const { action, targetType, keyword, startDate, endDate, userId, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (keyword) where.targetName = { contains: keyword, mode: 'insensitive' };
    if (userId) where.userId = parseInt(userId);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [total, data] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
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

module.exports = router;
