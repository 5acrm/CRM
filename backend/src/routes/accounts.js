const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

const router = express.Router();
const prisma = new PrismaClient();

// 获取账号列表（支持搜索，viewMode: 'mine'=只看自己, 'all'=按角色可见）
router.get('/', authenticate, async (req, res) => {
  try {
    const { keyword, role, region, viewMode = 'mine' } = req.query;
    let where = {};

    if (viewMode === 'mine') {
      where.userId = req.user.id;
    } else {
      const userRole = req.user.role;
      if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
        if (userRole === 'DEPT_MANAGER') {
          const deptUsers = await prisma.user.findMany({ where: { departmentId: req.user.departmentId }, select: { id: true } });
          where.userId = { in: deptUsers.map(u => u.id) };
        } else if (userRole === 'SUPERVISOR') {
          const subs = await prisma.user.findMany({ where: { superiorId: req.user.id }, select: { id: true } });
          const subIds = subs.map(u => u.id);
          const subSubs = await prisma.user.findMany({ where: { superiorId: { in: subIds } }, select: { id: true } });
          where.userId = { in: [req.user.id, ...subIds, ...subSubs.map(u => u.id)] };
        } else if (userRole === 'TEAM_LEADER') {
          const subs = await prisma.user.findMany({ where: { superiorId: req.user.id }, select: { id: true } });
          where.userId = { in: [req.user.id, ...subs.map(u => u.id)] };
        } else {
          where.userId = req.user.id;
        }
      }
    }

    if (keyword) {
      where.OR = [
        { phoneNumber: { contains: keyword } },
        { nickname: { contains: keyword } }
      ];
    }
    if (role) where.role = role;
    if (region) where.region = region;

    const accounts = await prisma.waAccount.findMany({
      where,
      include: { user: { select: { id: true, displayName: true, username: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(accounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取我的账号（必须在 /:id 之前）
router.get('/mine', authenticate, async (req, res) => {
  try {
    const accounts = await prisma.waAccount.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取即将到期的账号（3天内，必须在 /:id 之前）
router.get('/expiring', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const where = {
      renewalDate: { gte: now, lte: in3Days },
      isActive: true,
      isPermanentBan: false
    };

    if (!['SUPER_ADMIN', 'ADMIN', 'DEPT_MANAGER', 'SUPERVISOR', 'TEAM_LEADER'].includes(req.user.role)) {
      where.userId = req.user.id;
    }

    const accounts = await prisma.waAccount.findMany({
      where,
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { renewalDate: 'asc' }
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建账号
router.post('/', authenticate, async (req, res) => {
  try {
    const { phoneNumber, nickname, role, region, renewalDate } = req.body;
    if (!phoneNumber || !role || !region) {
      return res.status(400).json({ message: '手机号、角色、地区为必填项' });
    }

    const existingAccount = await prisma.waAccount.findUnique({ where: { phoneNumber } });
    if (existingAccount) return res.status(400).json({ message: '该手机号已存在' });

    const account = await prisma.waAccount.create({
      data: {
        userId: req.user.id,
        phoneNumber, nickname, role, region,
        renewalDate: renewalDate ? new Date(renewalDate) : null
      }
    });
    res.json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 已续费（续费日期 +28 天，必须在 /:id 之前）
router.post('/:id/renew', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const account = await prisma.waAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ message: '账号不存在' });

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isAdmin && account.userId !== req.user.id) return res.status(403).json({ message: '权限不足' });

    // 如果当前续费日期还在未来，从那天开始+28；否则从今天开始
    const base = account.renewalDate && new Date(account.renewalDate) > new Date()
      ? new Date(account.renewalDate)
      : new Date();
    const newDate = new Date(base.getTime() + 28 * 24 * 60 * 60 * 1000);

    const updated = await prisma.waAccount.update({
      where: { id },
      data: { renewalDate: newDate }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新账号
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const account = await prisma.waAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ message: '账号不存在' });

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isAdmin && account.userId !== req.user.id) return res.status(403).json({ message: '权限不足' });

    const { phoneNumber, nickname, role, region, renewalDate, banTime, banCount, isPermanentBan, isActive } = req.body;
    const updated = await prisma.waAccount.update({
      where: { id },
      data: {
        phoneNumber, nickname, role, region,
        renewalDate: renewalDate ? new Date(renewalDate) : undefined,
        banTime: banTime ? new Date(banTime) : undefined,
        banCount: banCount !== undefined ? parseInt(banCount) : undefined,
        isPermanentBan, isActive
      }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除账号
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const account = await prisma.waAccount.findUnique({ where: { id } });
    if (!account) return res.status(404).json({ message: '账号不存在' });

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isAdmin && account.userId !== req.user.id) return res.status(403).json({ message: '权限不足' });

    await prisma.waAccount.delete({ where: { id } });
    res.json({ message: '账号已删除' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2003' || err.message?.includes('Foreign key constraint')) {
      return res.status(400).json({ message: '该账号有关联的跟进记录，无法删除。请先停用账号。' });
    }
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
