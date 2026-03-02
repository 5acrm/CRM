const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogger');

const router = express.Router();

const ROLE_WEIGHT = { MEMBER: 1, TRANSLATOR: 1, TEAM_LEADER: 2, SUPERVISOR: 3, DEPT_MANAGER: 4, ADMIN: 5, SUPER_ADMIN: 6 };

const GROUP_TYPE_LABELS = { COMMUNITY: '社区', REGULAR: '普群' };
const GROUP_ATTR_LABELS = { CRYPTO: '币', STOCK: '股' };

// 获取群组列表（viewMode: 'mine'=只看自己, 'all'=按角色可见）
router.get('/', authenticate, async (req, res) => {
  try {
    const { viewMode = 'mine', keyword, startDate, endDate, groupNumber } = req.query;
    let where = {};

    if (viewMode === 'mine') {
      where.userId = req.user.id;
    } else {
      const role = req.user.role;
      if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        if (role === 'DEPT_MANAGER') {
          const deptUsers = await prisma.user.findMany({ where: { departmentId: req.user.departmentId }, select: { id: true } });
          where.userId = { in: deptUsers.map(u => u.id) };
        } else if (['SUPERVISOR', 'TEAM_LEADER'].includes(role)) {
          const subs = await prisma.user.findMany({ where: { superiorId: req.user.id }, select: { id: true } });
          const subIds = subs.map(u => u.id);
          if (role === 'SUPERVISOR') {
            const subSubs = await prisma.user.findMany({ where: { superiorId: { in: subIds } }, select: { id: true } });
            where.userId = { in: [req.user.id, ...subIds, ...subSubs.map(u => u.id)] };
          } else {
            where.userId = { in: [req.user.id, ...subIds] };
          }
        } else {
          where.userId = req.user.id;
        }
      }
    }

    // 关键词搜索
    if (keyword) {
      where.name = { contains: keyword, mode: 'insensitive' };
    }
    // 日期范围筛选
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    // 按小组编号筛选
    if (groupNumber) {
      const groupUsers = await prisma.user.findMany({
        where: { groupNumber: parseInt(groupNumber), isHidden: false },
        select: { id: true }
      });
      where.userId = { in: groupUsers.map(u => u.id) };
    }

    const groups = await prisma.waGroup.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, username: true } },
        mergedInto: { select: { id: true, name: true } },
        _count: { select: { customers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建群组
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, cost, groupType, groupAttr, createdDate, remark } = req.body;
    if (!name) return res.status(400).json({ message: '群组名称为必填项' });

    const data = {
      name,
      userId: req.user.id,
      cost: cost ? parseFloat(cost) : 3500,
      groupType: groupType || null,
      groupAttr: groupAttr || null,
      remark: remark || null
    };
    if (createdDate) {
      data.createdAt = new Date(createdDate);
    }

    const group = await prisma.waGroup.create({ data });
    logActivity({ userId: req.user.id, action: 'CREATE', targetType: 'GROUP', targetId: group.id, targetName: group.name });
    res.json(group);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取今日未录入数据的群组
router.get('/missing-stats', authenticate, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const groups = await prisma.waGroup.findMany({
      where: {
        isActive: true,
        isMerged: false,
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        user: { select: { id: true, displayName: true } },
        dailyStats: {
          where: { date: { gte: todayStart, lte: todayEnd } }
        }
      }
    });

    const missing = groups.filter(g => g.dailyStats.length === 0);
    res.json(missing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新群组
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const group = await prisma.waGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ message: '群组不存在' });

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    if (!isAdmin && group.userId !== req.user.id) {
      return res.status(403).json({ message: '权限不足' });
    }

    const { name, cost, isActive, groupType, groupAttr, remark } = req.body;

    // 仅组长及以上角色可修改群成本
    if (cost !== undefined && cost !== null && cost !== group.cost) {
      const userWeight = ROLE_WEIGHT[req.user.role] || 0;
      if (userWeight < ROLE_WEIGHT['TEAM_LEADER']) {
        return res.status(403).json({ message: '仅组长及以上角色可修改群成本' });
      }
    }

    const updated = await prisma.waGroup.update({
      where: { id },
      data: {
        name,
        cost: cost !== undefined && cost !== null ? parseFloat(cost) : undefined,
        isActive,
        groupType: groupType !== undefined ? groupType : undefined,
        groupAttr: groupAttr !== undefined ? groupAttr : undefined,
        remark: remark !== undefined ? (remark || null) : undefined
      }
    });
    logActivity({ userId: req.user.id, action: 'UPDATE', targetType: 'GROUP', targetId: parseInt(req.params.id), targetName: updated.name, details: req.body });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 合并群组（将源群合并到目标群，源群变灰）
router.post('/:id/merge', authenticate, async (req, res) => {
  try {
    const allowed = ['SUPER_ADMIN', 'ADMIN', 'DEPT_MANAGER', 'SUPERVISOR'];
    if (!allowed.includes(req.user.role)) return res.status(403).json({ message: '只有主管及以上可以合并群组' });

    const sourceId = parseInt(req.params.id);
    const { targetGroupId } = req.body;
    if (!targetGroupId) return res.status(400).json({ message: '请选择目标群组' });
    if (sourceId === parseInt(targetGroupId)) return res.status(400).json({ message: '不能合并到自身' });

    const source = await prisma.waGroup.findUnique({ where: { id: sourceId } });
    const target = await prisma.waGroup.findUnique({ where: { id: parseInt(targetGroupId) } });
    if (!source || !target) return res.status(404).json({ message: '群组不存在' });
    if (source.isMerged) return res.status(400).json({ message: '该群组已被合并' });

    await prisma.waGroup.update({
      where: { id: sourceId },
      data: { isMerged: true, mergedIntoId: parseInt(targetGroupId), isActive: false }
    });

    res.json({ message: `已将"${source.name}"合并到"${target.name}"` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取群组每日数据
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

    const where = { groupId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const stats = await prisma.groupDailyStat.findMany({
      where,
      orderBy: { date: 'desc' }
    });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 录入群组每日数据
router.post('/:id/stats', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = await prisma.waGroup.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ message: '群组不存在' });

    const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'TEAM_LEADER', 'SUPERVISOR', 'DEPT_MANAGER'].includes(req.user.role);
    if (!isAdmin && group.userId !== req.user.id) {
      return res.status(403).json({ message: '权限不足' });
    }

    const { date, totalMembers, realCustomers, ownAccounts, dailyExits, viewers, inquiries, conversions, depositUsd } = req.body;
    const statDate = date ? new Date(date) : new Date();
    statDate.setHours(0, 0, 0, 0);

    const stat = await prisma.groupDailyStat.upsert({
      where: { groupId_date: { groupId, date: statDate } },
      update: {
        totalMembers: parseInt(totalMembers) || 0,
        realCustomers: parseInt(realCustomers) || 0,
        ownAccounts: parseInt(ownAccounts) || 0,
        dailyExits: parseInt(dailyExits) || 0,
        viewers: parseInt(viewers) || 0,
        inquiries: parseInt(inquiries) || 0,
        conversions: parseInt(conversions) || 0,
        depositUsd: parseFloat(depositUsd) || 0
      },
      create: {
        groupId, date: statDate,
        totalMembers: parseInt(totalMembers) || 0,
        realCustomers: parseInt(realCustomers) || 0,
        ownAccounts: parseInt(ownAccounts) || 0,
        dailyExits: parseInt(dailyExits) || 0,
        viewers: parseInt(viewers) || 0,
        inquiries: parseInt(inquiries) || 0,
        conversions: parseInt(conversions) || 0,
        depositUsd: parseFloat(depositUsd) || 0
      }
    });
    res.json(stat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取群组汇总（支持月份筛选，成本按月计算不累计）
router.get('/:id/summary', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { month } = req.query; // 格式 YYYY-MM，默认当月

    const group = await prisma.waGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { customers: true } } }
    });
    if (!group) return res.status(404).json({ message: '群组不存在' });

    // 计算月份范围
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);
    const startOfMonth = new Date(year, mon - 1, 1);
    const endOfMonth = new Date(year, mon, 0, 23, 59, 59);

    // 当月入金（从所有在该群组的客户的交易记录统计）
    const totalDeposit = await prisma.transaction.aggregate({
      where: {
        customer: { currentGroupId: groupId },
        type: 'DEPOSIT',
        recordedAt: { gte: startOfMonth, lte: endOfMonth }
      },
      _sum: { usdAmount: true }
    });

    // 群成本每月固定，不累计
    const netProfit = (totalDeposit._sum.usdAmount || 0) - group.cost;

    res.json({
      group,
      month: targetMonth,
      totalDepositUsd: totalDeposit._sum.usdAmount || 0,
      groupCost: group.cost,
      netProfit,
      customerCount: group._count.customers
    });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
