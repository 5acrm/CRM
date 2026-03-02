const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { buildVisibilityFilter, canMoveCustomer, ROLE_WEIGHT } = require('../middleware/permission');
const { logActivity } = require('../services/activityLogger');

const router = express.Router();
const prisma = new PrismaClient();

// 搜索/列表客户（viewMode: 'mine'=只看自己, 'all'=按角色可见）
router.get('/', authenticate, async (req, res) => {
  try {
    const { keyword, uid, groupId, assignedUserId, hasDeposit, followUpStatus, viewMode = 'mine', page = 1, pageSize = 20 } = req.query;
    const where = viewMode === 'mine'
      ? { createdById: req.user.id }
      : { ...buildVisibilityFilter(req.user) };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
        { email: { contains: keyword } }
      ];
    }
    if (uid) where.uid = { contains: uid };
    if (groupId) where.currentGroupId = parseInt(groupId);
    if (assignedUserId) where.createdById = parseInt(assignedUserId);
    if (followUpStatus) where.followUpStatus = { contains: followUpStatus };
    if (hasDeposit === 'true') {
      where.transactions = { some: { type: 'DEPOSIT' } };
    } else if (hasDeposit === 'false') {
      where.transactions = { none: { type: 'DEPOSIT' } };
    }

    const total = await prisma.customer.count({ where });
    const customers = await prisma.customer.findMany({
      where,
      include: {
        currentGroup: { select: { id: true, name: true } },
        waAccountLinks: {
          include: { waAccount: { select: { id: true, phoneNumber: true, nickname: true, role: true } } }
        },
        createdBy: { select: { id: true, displayName: true, username: true } },
        followers: {
          include: {
            user: { select: { id: true, displayName: true } },
            waAccount: { select: { id: true, nickname: true, role: true } }
          }
        },
        wallets: true,
        _count: { select: { transactions: true, followUpRecords: true } }
      },
      orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize)
    });

    // 批量获取每位客户的入金总额
    const customerIds = customers.map(c => c.id);
    const depositAggs = await prisma.transaction.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, type: 'DEPOSIT' },
      _sum: { usdAmount: true }
    });
    const depositMap = {};
    depositAggs.forEach(d => { depositMap[d.customerId] = d._sum.usdAmount || 0; });
    const enriched = customers.map(c => ({ ...c, totalDepositUsd: depositMap[c.id] || 0 }));

    res.json({ total, page: parseInt(page), pageSize: parseInt(pageSize), data: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取单个客户详情
router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        currentGroup: true,
        waAccountLinks: {
          include: { waAccount: true, addedBy: { select: { id: true, displayName: true } } }
        },
        createdBy: { select: { id: true, displayName: true, username: true } },
        followers: {
          include: {
            user: { select: { id: true, displayName: true } },
            waAccount: { select: { id: true, nickname: true, role: true, phoneNumber: true } }
          }
        },
        wallets: true,
        groupHistory: {
          include: {
            fromGroup: { select: { id: true, name: true } },
            movedBy: { select: { id: true, displayName: true } }
          },
          orderBy: { movedAt: 'desc' }
        },
        followUpReminders: {
          where: { isCompleted: false },
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { scheduledAt: 'asc' }
        }
      }
    });
    if (!customer) return res.status(404).json({ message: '客户不存在' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建客户（电话号码为必填，名称可选默认为电话）
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, uid, email, phone, hasMiningAuth, miningWalletName, miningWalletAddress,
            isRegistered, isRealName, isStarred, currentGroupId, waAccountIds, followUpStatus, wallets } = req.body;
    if (!phone) return res.status(400).json({ message: '电话号码为必填项' });

    if (phone) {
      if (!/^\d+$/.test(phone)) return res.status(400).json({ message: '电话号码只能包含数字' });
      const phoneExists = await prisma.customer.findFirst({ where: { phone } });
      if (phoneExists) return res.status(400).json({ message: '该电话号码已被其他客户使用' });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name || phone,
        uid, email, phone,
        hasMiningAuth: hasMiningAuth || false,
        miningWalletName: hasMiningAuth ? (miningWalletName || null) : null,
        miningWalletAddress: hasMiningAuth ? (miningWalletAddress || null) : null,
        isRegistered: isRegistered || false,
        isRealName: isRealName || false,
        isStarred: isStarred || false,
        followUpStatus,
        currentGroupId: currentGroupId ? parseInt(currentGroupId) : null,
        createdById: req.user.id,
        wallets: wallets ? {
          create: wallets.map(w => ({ currency: w.currency, address: w.address }))
        } : undefined
      },
      include: { currentGroup: true, wallets: true }
    });

    logActivity({ userId: req.user.id, action: 'CREATE', targetType: 'CUSTOMER', targetId: customer.id, targetName: customer.name || customer.phone });

    // 创建关联 WA 账号（只能关联自己的账号）
    if (waAccountIds && waAccountIds.length > 0) {
      const myAccountIds = (await prisma.waAccount.findMany({
        where: { id: { in: waAccountIds.map(Number) }, userId: req.user.id },
        select: { id: true }
      })).map(a => a.id);
      if (myAccountIds.length > 0) {
        await prisma.customerWaAccount.createMany({
          data: myAccountIds.map(waId => ({ customerId: customer.id, waAccountId: waId, addedById: req.user.id }))
        });
      }
    }

    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新客户
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, uid, email, phone, hasMiningAuth, miningWalletName, miningWalletAddress,
            isRegistered, isRealName, isStarred, waAccountIds, followUpStatus } = req.body;

    if (phone) {
      if (!/^\d+$/.test(phone)) return res.status(400).json({ message: '电话号码只能包含数字' });
      const phoneExists = await prisma.customer.findFirst({ where: { phone, id: { not: parseInt(req.params.id) } } });
      if (phoneExists) return res.status(400).json({ message: '该电话号码已被其他客户使用' });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name || undefined,
        uid: uid !== undefined ? (uid || null) : undefined,
        email: email !== undefined ? (email || null) : undefined,
        phone: phone !== undefined ? (phone || null) : undefined,
        hasMiningAuth: hasMiningAuth !== undefined ? hasMiningAuth : undefined,
        miningWalletName: hasMiningAuth ? (miningWalletName || null) : null,
        miningWalletAddress: hasMiningAuth ? (miningWalletAddress || null) : null,
        isRegistered: isRegistered !== undefined ? isRegistered : undefined,
        isRealName: isRealName !== undefined ? isRealName : undefined,
        isStarred: isStarred !== undefined ? isStarred : undefined,
        followUpStatus: followUpStatus !== undefined ? (followUpStatus || null) : undefined
      },
      include: { currentGroup: true, wallets: true }
    });

    logActivity({ userId: req.user.id, action: 'UPDATE', targetType: 'CUSTOMER', targetId: parseInt(req.params.id), targetName: updated.name || updated.phone, details: req.body });

    // 更新关联 WA 账号：删除当前用户添加的旧记录，新增选择的（只能操作自己的账号）
    if (waAccountIds !== undefined) {
      await prisma.customerWaAccount.deleteMany({ where: { customerId: id, addedById: req.user.id } });
      if (waAccountIds.length > 0) {
        const myAccountIds = (await prisma.waAccount.findMany({
          where: { id: { in: waAccountIds.map(Number) }, userId: req.user.id },
          select: { id: true }
        })).map(a => a.id);
        if (myAccountIds.length > 0) {
          await prisma.customerWaAccount.createMany({
            data: myAccountIds.map(waId => ({ customerId: id, waAccountId: waId, addedById: req.user.id }))
          });
        }
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('Customer update error:', err);
    res.status(500).json({ message: err.message || '服务器错误' });
  }
});

// 创建跟进提醒
router.post('/:id/reminders', authenticate, async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { scheduledAt, content } = req.body;
    if (!scheduledAt || !content) return res.status(400).json({ message: '请填写提醒时间和内容' });

    const reminder = await prisma.followUpReminder.create({
      data: {
        customerId,
        userId: req.user.id,
        scheduledAt: new Date(scheduledAt),
        content
      }
    });

    // 同时创建待办事项
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, phone: true } });
    await prisma.todoItem.create({
      data: {
        userId: req.user.id,
        title: `跟进提醒：${customer?.name || customer?.phone || '客户'}`,
        content,
        dueDate: new Date(scheduledAt),
        type: 'FOLLOWUP_REMINDER',
        relatedCustomerId: customerId
      }
    });

    res.json(reminder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 完成跟进提醒
router.put('/:id/reminders/:reminderId/complete', authenticate, async (req, res) => {
  try {
    const reminderId = parseInt(req.params.reminderId);
    const reminder = await prisma.followUpReminder.update({
      where: { id: reminderId },
      data: { isCompleted: true }
    });

    // 同步完成关联的待办事项
    await prisma.todoItem.updateMany({
      where: {
        type: 'FOLLOWUP_REMINDER',
        relatedCustomerId: parseInt(req.params.id),
        userId: req.user.id,
        isCompleted: false
      },
      data: { isCompleted: true }
    });

    res.json(reminder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除客户（主管及以上）
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const allowed = ['SUPER_ADMIN', 'ADMIN', 'DEPT_MANAGER', 'SUPERVISOR'];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: '只有主管及以上权限可以删除客户' });
    }

    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ message: '客户不存在' });
    const customerName = customer.name || customer.phone;

    // 手动级联删除（避免 FK 约束报错）
    await prisma.$transaction(async (tx) => {
      // 删除评论回复
      const comments = await tx.followUpComment.findMany({
        where: { record: { customerId: id } }, select: { id: true }
      });
      if (comments.length > 0) {
        await tx.commentResponse.deleteMany({ where: { commentId: { in: comments.map(c => c.id) } } });
        await tx.followUpComment.deleteMany({ where: { id: { in: comments.map(c => c.id) } } });
      }
      await tx.customerWaAccount.deleteMany({ where: { customerId: id } });
      await tx.followUpRecord.deleteMany({ where: { customerId: id } });
      await tx.transaction.deleteMany({ where: { customerId: id } });
      await tx.translationTask.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.customer.delete({ where: { id } });
    });

    logActivity({ userId: req.user.id, action: 'DELETE', targetType: 'CUSTOMER', targetId: id, targetName: customerName });
    res.json({ message: '客户已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 移动客户到新群组（组长及以上）
router.put('/:id/move-group', authenticate, canMoveCustomer, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { newGroupId } = req.body;
    if (!newGroupId) return res.status(400).json({ message: '请选择目标群组' });

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ message: '客户不存在' });

    await prisma.customerGroupHistory.create({
      data: {
        customerId: id,
        fromGroupId: customer.currentGroupId,
        toGroupId: parseInt(newGroupId),
        movedById: req.user.id
      }
    });

    const updated = await prisma.customer.update({
      where: { id },
      data: { currentGroupId: parseInt(newGroupId) },
      include: { currentGroup: true }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新客户钱包
router.put('/:id/wallets', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { wallets } = req.body;

    await prisma.customerWallet.deleteMany({ where: { customerId: id } });
    if (wallets && wallets.length > 0) {
      await prisma.customerWallet.createMany({
        data: wallets.map(w => ({ customerId: id, currency: w.currency, address: w.address }))
      });
    }

    const updated = await prisma.customerWallet.findMany({ where: { customerId: id } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新同时跟进人员
router.put('/:id/followers', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { followers } = req.body;

    await prisma.customerFollower.deleteMany({ where: { customerId: id } });
    if (followers && followers.length > 0) {
      for (const f of followers) {
        await prisma.customerFollower.upsert({
          where: { customerId_userId: { customerId: id, userId: f.userId } },
          update: { waAccountId: f.waAccountId || null, waRole: f.waRole || null },
          create: { customerId: id, userId: f.userId, waAccountId: f.waAccountId || null, waRole: f.waRole || null }
        });
      }
    }

    const updated = await prisma.customerFollower.findMany({
      where: { customerId: id },
      include: {
        user: { select: { id: true, displayName: true } },
        waAccount: { select: { id: true, nickname: true, role: true } }
      }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 客户财务汇总
router.get('/:id/finance-summary', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const deposits = await prisma.transaction.aggregate({
      where: { customerId: id, type: 'DEPOSIT' },
      _sum: { usdAmount: true },
      _count: true
    });
    const withdrawals = await prisma.transaction.aggregate({
      where: { customerId: id, type: 'WITHDRAWAL' },
      _sum: { usdAmount: true },
      _count: true
    });

    res.json({
      totalDepositUsd: deposits._sum.usdAmount || 0,
      depositCount: deposits._count,
      totalWithdrawalUsd: withdrawals._sum.usdAmount || 0,
      withdrawalCount: withdrawals._count,
      netUsd: (deposits._sum.usdAmount || 0) - (withdrawals._sum.usdAmount || 0)
    });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
