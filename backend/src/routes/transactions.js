const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getCryptoRate } = require('../services/cryptoRate');

const router = express.Router();

// 根据角色获取可见的 userId 列表（null = 全部可见）
async function getVisibleUserIds(user) {
  const role = user.role;
  if (['SUPER_ADMIN', 'ADMIN', 'TRANSLATOR'].includes(role)) return null;

  if (role === 'DEPT_MANAGER') {
    const users = await prisma.user.findMany({ where: { departmentId: user.departmentId, isHidden: false }, select: { id: true } });
    return users.map(u => u.id);
  }
  if (role === 'SUPERVISOR') {
    const leaders = await prisma.user.findMany({ where: { superiorId: user.id }, select: { id: true } });
    const leaderIds = leaders.map(l => l.id);
    const members = await prisma.user.findMany({ where: { superiorId: { in: leaderIds } }, select: { id: true } });
    return [user.id, ...leaderIds, ...members.map(m => m.id)];
  }
  if (role === 'TEAM_LEADER') {
    const members = await prisma.user.findMany({ where: { superiorId: user.id }, select: { id: true } });
    return [user.id, ...members.map(m => m.id)];
  }
  return [user.id];
}

// 获取交易记录（支持 viewMode + groupNumber + assignedUserId 筛选）
router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, type, currency, startDate, endDate, viewMode = 'all', groupNumber, assignedUserId, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (customerId) where.customerId = parseInt(customerId);
    if (type) where.type = type;
    if (currency) where.currency = currency;
    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) where.recordedAt.gte = new Date(startDate);
      if (endDate) where.recordedAt.lte = new Date(endDate);
    }

    if (viewMode === 'mine') {
      where.userId = req.user.id;
    } else if (assignedUserId) {
      where.userId = parseInt(assignedUserId);
    } else if (groupNumber) {
      // 按小组编号筛选：找到该小组的所有用户
      const groupUsers = await prisma.user.findMany({
        where: { groupNumber: parseInt(groupNumber), isHidden: false },
        select: { id: true }
      });
      where.userId = { in: groupUsers.map(u => u.id) };
    } else {
      const visibleIds = await getVisibleUserIds(req.user);
      if (visibleIds !== null) where.userId = { in: visibleIds };
    }

    const total = await prisma.transaction.count({ where });
    const records = await prisma.transaction.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, uid: true } },
        user: { select: { id: true, displayName: true } }
      },
      orderBy: { recordedAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize)
    });

    res.json({ total, data: records });
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建交易记录（BTC/ETH 支持手动填写 USD 金额）
router.post('/', authenticate, async (req, res) => {
  try {
    const { customerId, type, currency, amount, note, recordedAt, usdAmount: manualUsdAmount } = req.body;
    if (!customerId || !type || !currency || !amount) {
      return res.status(400).json({ message: '客户、类型、币种、金额为必填项' });
    }

    let rate = 1;
    let usdAmount;

    if (['BTC', 'ETH'].includes(currency)) {
      if (manualUsdAmount !== undefined && manualUsdAmount !== null && manualUsdAmount !== '') {
        usdAmount = parseFloat(manualUsdAmount);
        rate = parseFloat(amount) > 0 ? usdAmount / parseFloat(amount) : 0;
      } else {
        rate = await getCryptoRate(currency);
        usdAmount = parseFloat(amount) * rate;
      }
    } else {
      usdAmount = parseFloat(amount);
    }

    const transaction = await prisma.transaction.create({
      data: {
        customerId: parseInt(customerId),
        userId: req.user.id,
        type, currency,
        amount: parseFloat(amount),
        usdAmount,
        rateAtTime: rate,
        note,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date()
      },
      include: { customer: { select: { id: true, name: true } } }
    });

    res.json(transaction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 修改交易记录
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: '记录不存在' });

    const { type, currency, amount, note, recordedAt, usdAmount: manualUsdAmount } = req.body;

    let rate = existing.rateAtTime;
    let usdAmount = existing.usdAmount;
    const finalCurrency = currency || existing.currency;
    const finalAmount = amount !== undefined ? parseFloat(amount) : existing.amount;

    if (amount !== undefined || currency || manualUsdAmount !== undefined) {
      if (['BTC', 'ETH'].includes(finalCurrency)) {
        if (manualUsdAmount !== undefined && manualUsdAmount !== null && manualUsdAmount !== '') {
          usdAmount = parseFloat(manualUsdAmount);
          rate = finalAmount > 0 ? usdAmount / finalAmount : 0;
        } else {
          rate = await getCryptoRate(finalCurrency);
          usdAmount = finalAmount * rate;
        }
      } else {
        usdAmount = finalAmount;
        rate = 1;
      }
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        type: type || undefined,
        currency: currency || undefined,
        amount: amount !== undefined ? finalAmount : undefined,
        usdAmount,
        rateAtTime: rate,
        note: note !== undefined ? note : undefined,
        recordedAt: recordedAt ? new Date(recordedAt) : undefined
      },
      include: { customer: { select: { id: true, name: true } } }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除交易记录
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: '记录不存在' });
    await prisma.transaction.delete({ where: { id } });
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 统计数据（支持 viewMode + groupNumber + assignedUserId 筛选）
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { userId, startDate, endDate, viewMode = 'all', groupNumber, assignedUserId } = req.query;
    const where = {};

    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) where.recordedAt.gte = new Date(startDate);
      if (endDate) where.recordedAt.lte = new Date(endDate);
    }

    if (viewMode === 'mine') {
      where.userId = req.user.id;
    } else if (userId) {
      where.userId = parseInt(userId);
    } else if (assignedUserId) {
      where.userId = parseInt(assignedUserId);
    } else if (groupNumber) {
      const groupUsers = await prisma.user.findMany({
        where: { groupNumber: parseInt(groupNumber), isHidden: false },
        select: { id: true }
      });
      where.userId = { in: groupUsers.map(u => u.id) };
    } else {
      const visibleIds = await getVisibleUserIds(req.user);
      if (visibleIds !== null) where.userId = { in: visibleIds };
    }

    const deposits = await prisma.transaction.aggregate({
      where: { ...where, type: 'DEPOSIT' },
      _sum: { usdAmount: true },
      _count: true
    });
    const withdrawals = await prisma.transaction.aggregate({
      where: { ...where, type: 'WITHDRAWAL' },
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

// 获取当前汇率
router.get('/rates', authenticate, async (req, res) => {
  try {
    const btc = await getCryptoRate('BTC');
    const eth = await getCryptoRate('ETH');
    res.json({ BTC: btc, ETH: eth, USDT: 1, USDC: 1 });
  } catch (err) {
    res.status(500).json({ message: '获取汇率失败' });
  }
});

module.exports = router;
