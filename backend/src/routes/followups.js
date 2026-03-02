const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../socket');

const router = express.Router();

// 获取全部跟进记录（按角色权限过滤）
router.get('/', authenticate, async (req, res) => {
  try {
    const { keyword, userId, contactType, page = 1, pageSize = 20 } = req.query;
    const role = req.user.role;

    // 按角色构建可见用户范围
    let userWhere = {};
    if (!['SUPER_ADMIN', 'ADMIN', 'TRANSLATOR'].includes(role)) {
      if (role === 'DEPT_MANAGER') {
        userWhere = { departmentId: req.user.departmentId };
      } else if (role === 'SUPERVISOR') {
        userWhere = { OR: [{ id: req.user.id }, { superiorId: req.user.id }, { superior: { superiorId: req.user.id } }] };
      } else if (role === 'TEAM_LEADER') {
        userWhere = { OR: [{ id: req.user.id }, { superiorId: req.user.id }] };
      } else {
        userWhere = { id: req.user.id };
      }
    }

    const where = { user: userWhere };
    if (keyword) {
      where.customer = { OR: [{ name: { contains: keyword, mode: 'insensitive' } }, { phone: { contains: keyword, mode: 'insensitive' } }] };
    }
    if (userId) where.userId = parseInt(userId);
    if (contactType) where.contactType = contactType;

    const total = await prisma.followUpRecord.count({ where });
    const records = await prisma.followUpRecord.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, phone: true, followUpStatus: true, currentGroup: { select: { name: true } } }
        },
        user: { select: { id: true, displayName: true, role: true } },
        waAccount: { select: { id: true, nickname: true, phoneNumber: true, role: true } },
        comments: {
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            responses: {
              include: { user: { select: { id: true, displayName: true } } }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize)
    });

    res.json({ total, data: records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取客户的跟进记录
router.get('/customer/:customerId', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const records = await prisma.followUpRecord.findMany({
      where: { customerId },
      include: {
        user: { select: { id: true, displayName: true, role: true } },
        waAccount: { select: { id: true, nickname: true, phoneNumber: true, role: true } },
        comments: {
          include: {
            user: { select: { id: true, displayName: true, role: true } },
            responses: {
              include: { user: { select: { id: true, displayName: true, role: true } } }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建跟进记录
router.post('/', authenticate, async (req, res) => {
  try {
    const { customerId, waAccountId, waRole, contactType, content } = req.body;
    if (!customerId || !content) {
      return res.status(400).json({ message: '客户ID和内容为必填项' });
    }

    const record = await prisma.followUpRecord.create({
      data: {
        customerId: parseInt(customerId),
        userId: req.user.id,
        waAccountId: waAccountId ? parseInt(waAccountId) : null,
        waRole: waRole || null,
        contactType: contactType || 'TEXT',
        content
      },
      include: {
        user: { select: { id: true, displayName: true, role: true } },
        waAccount: { select: { id: true, nickname: true, role: true } }
      }
    });
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 添加建议/评价（组长及以上）
router.post('/:recordId/comments', authenticate, async (req, res) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: '内容不能为空' });

    const allowedRoles = ['TEAM_LEADER', 'SUPERVISOR', 'DEPT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: '只有组长及以上可以添加建议' });
    }

    const record = await prisma.followUpRecord.findUnique({
      where: { id: recordId },
      include: { user: true }
    });
    if (!record) return res.status(404).json({ message: '跟进记录不存在' });

    const comment = await prisma.followUpComment.create({
      data: { recordId, userId: req.user.id, content },
      include: { user: { select: { id: true, displayName: true, role: true } } }
    });

    const io = req.app.get('io');

    // 主管/部门经理/管理员写建议：通知业务员和组长
    if (['SUPERVISOR', 'DEPT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      // 通知业务员
      const memberNotif = await prisma.notification.create({
        data: {
          userId: record.userId,
          type: 'SUPERVISOR_COMMENT',
          title: '主管添加了建议',
          content: `${req.user.displayName || req.user.username} 对你的跟进记录添加了建议，请回应`,
          relatedId: comment.id
        }
      });
      sendNotification(io, record.userId, memberNotif);

      // 找组长并通知
      const member = await prisma.user.findUnique({ where: { id: record.userId }, include: { superior: true } });
      if (member?.superior && member.superior.role === 'TEAM_LEADER') {
        const leaderNotif = await prisma.notification.create({
          data: {
            userId: member.superior.id,
            type: 'SUPERVISOR_COMMENT',
            title: '主管添加了建议',
            content: `${req.user.displayName || req.user.username} 对你组员的跟进记录添加了建议`,
            relatedId: comment.id
          }
        });
        sendNotification(io, member.superior.id, leaderNotif);
      }
    }

    // 组长写建议：通知业务员
    if (req.user.role === 'TEAM_LEADER') {
      const notif = await prisma.notification.create({
        data: {
          userId: record.userId,
          type: 'LEADER_COMMENT',
          title: '组长添加了建议',
          content: `${req.user.displayName || req.user.username} 对你的跟进记录添加了建议，请回应`,
          relatedId: comment.id
        }
      });
      sendNotification(io, record.userId, notif);
    }

    res.json(comment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 回应建议
router.post('/comments/:commentId/responses', authenticate, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: '内容不能为空' });

    const comment = await prisma.followUpComment.findUnique({
      where: { id: commentId },
      include: { user: true }
    });
    if (!comment) return res.status(404).json({ message: '建议不存在' });

    const response = await prisma.commentResponse.create({
      data: { commentId, userId: req.user.id, content },
      include: { user: { select: { id: true, displayName: true, role: true } } }
    });

    // 通知建议人
    const io = req.app.get('io');
    const notif = await prisma.notification.create({
      data: {
        userId: comment.userId,
        type: 'COMMENT_RESPONSE',
        title: '有人回应了你的建议',
        content: `${req.user.displayName || req.user.username} 回应了你的建议`,
        relatedId: commentId
      }
    });
    sendNotification(io, comment.userId, notif);

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
