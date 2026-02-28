const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/permission');

const router = express.Router();
const prisma = new PrismaClient();

// 获取当前用户可管理的下属 ID 列表
async function getManageableSubIds(userId, role) {
  if (role === 'SUPERVISOR') {
    const subs = await prisma.user.findMany({ where: { superiorId: userId }, select: { id: true } });
    const subIds = subs.map(u => u.id);
    const subSubs = await prisma.user.findMany({ where: { superiorId: { in: subIds } }, select: { id: true } });
    return [...subIds, ...subSubs.map(u => u.id)];
  } else if (role === 'TEAM_LEADER') {
    const subs = await prisma.user.findMany({ where: { superiorId: userId }, select: { id: true } });
    return subs.map(u => u.id);
  }
  return [];
}

// 获取翻译员列表（所有登录用户可用）
router.get('/translators', authenticate, async (req, res) => {
  try {
    const translators = await prisma.user.findMany({
      where: { role: 'TRANSLATOR', isActive: true },
      select: { id: true, displayName: true, username: true }
    });
    res.json(translators);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取用户列表（管理员及以上，或主管/组长查看下属）
router.get('/', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
    const canManage = ['SUPERVISOR', 'TEAM_LEADER'].includes(role);

    if (!isAdmin && !canManage) {
      return res.status(403).json({ message: '权限不足' });
    }

    let where = { isHidden: false };
    if (!isAdmin) {
      const subIds = await getManageableSubIds(req.user.id, role);
      where = { isHidden: false, id: { in: subIds } };
    }

    const users = await prisma.user.findMany({
      where,
      include: { department: true, superior: { select: { id: true, displayName: true, username: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users.map(u => ({ ...u, passwordHash: undefined })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取下属列表（本人可见范围）
router.get('/subordinates', authenticate, async (req, res) => {
  try {
    let where = {};
    const role = req.user.role;

    if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      where = { isHidden: false };
    } else if (role === 'DEPT_MANAGER') {
      where = { departmentId: req.user.departmentId, isHidden: false };
    } else if (role === 'SUPERVISOR') {
      where = {
        isHidden: false,
        OR: [
          { superiorId: req.user.id },
          { superior: { superiorId: req.user.id } }
        ]
      };
    } else if (role === 'TEAM_LEADER') {
      where = { superiorId: req.user.id, isHidden: false };
    } else {
      where = { id: req.user.id };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, username: true, displayName: true, role: true, departmentId: true, superiorId: true }
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建用户（管理员及以上，或主管/组长在权限范围内）
router.post('/', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
    const isSupervisor = role === 'SUPERVISOR';
    const isTeamLeader = role === 'TEAM_LEADER';

    if (!isAdmin && !isSupervisor && !isTeamLeader) {
      return res.status(403).json({ message: '权限不足' });
    }

    const { username, password, displayName, role: newRole, email, departmentId, superiorId, groupNumber } = req.body;

    if (!username || !password || !newRole) {
      return res.status(400).json({ message: '用户名、密码和角色为必填项' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }

    // 不允许创建超管
    if (newRole === 'SUPER_ADMIN') {
      return res.status(403).json({ message: '不允许创建超级管理员账号' });
    }

    // 主管只能创建组长和组员；组长只能创建组员
    if (!isAdmin) {
      const allowedRoles = isSupervisor ? ['TEAM_LEADER', 'MEMBER'] : ['MEMBER'];
      if (!allowedRoles.includes(newRole)) {
        return res.status(403).json({ message: '无权创建该角色的用户' });
      }
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 非管理员创建时，如未指定上级则默认自己为上级
    const finalSuperiorId = isAdmin ? (superiorId || null) : (superiorId || req.user.id);

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hash,
        displayName: displayName || username,
        role: newRole,
        email,
        departmentId: departmentId || null,
        superiorId: finalSuperiorId || null,
        groupNumber: groupNumber ? parseInt(groupNumber) : null
      },
      include: { department: true }
    });

    res.json({ ...user, passwordHash: undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 更新用户（管理员及以上，或主管/组长在权限范围内）
router.put('/:id', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
    const isSupervisor = role === 'SUPERVISOR';
    const isTeamLeader = role === 'TEAM_LEADER';

    if (!isAdmin && !isSupervisor && !isTeamLeader) {
      return res.status(403).json({ message: '权限不足' });
    }

    const id = parseInt(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: '用户不存在' });
    if (target.role === 'SUPER_ADMIN') return res.status(403).json({ message: '不能修改超级管理员' });

    // 非管理员：检查是否为自己的下属
    if (!isAdmin) {
      const subIds = await getManageableSubIds(req.user.id, role);
      if (!subIds.includes(id)) {
        return res.status(403).json({ message: '无权修改该用户' });
      }
      // 检查要设置的角色是否超出权限
      const { role: newRole } = req.body;
      if (newRole) {
        const allowedRoles = isSupervisor ? ['TEAM_LEADER', 'MEMBER'] : ['MEMBER'];
        if (!allowedRoles.includes(newRole)) {
          return res.status(403).json({ message: '无权设置该角色' });
        }
      }
    }

    const { displayName, role: newRole, email, departmentId, superiorId, isActive, password, groupNumber } = req.body;

    const updateData = {
      displayName,
      email,
      departmentId: isAdmin ? (departmentId || null) : undefined,
      superiorId: isAdmin ? (superiorId || null) : undefined,
      groupNumber: groupNumber ? parseInt(groupNumber) : null
    };
    if (newRole && newRole !== 'SUPER_ADMIN') updateData.role = newRole;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (password && password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { department: true }
    });

    res.json({ ...user, passwordHash: undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除部门（必须放在 /:id 之前，避免路由冲突）
router.delete('/departments/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const count = await prisma.user.count({ where: { departmentId: id } });
    if (count > 0) return res.status(400).json({ message: `该部门下还有 ${count} 个用户，请先将用户移出再删除` });
    await prisma.department.delete({ where: { id } });
    res.json({ message: '部门已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 删除用户（管理员及以上）
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ message: '不能删除自己的账号' });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: '用户不存在' });
    if (target.role === 'SUPER_ADMIN') return res.status(403).json({ message: '不能删除超级管理员' });

    await prisma.user.delete({ where: { id } });
    res.json({ message: '用户已删除' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2003' || err.message?.includes('Foreign key constraint')) {
      return res.status(400).json({ message: '该用户有关联数据（客户/记录等），无法删除。请改为禁用账号。' });
    }
    res.status(500).json({ message: '服务器错误' });
  }
});

// 获取部门列表
router.get('/departments', authenticate, async (req, res) => {
  try {
    const departments = await prisma.department.findMany();
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

// 创建部门
router.post('/departments', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: '部门名称为必填项' });
    const dept = await prisma.department.create({ data: { name } });
    res.json(dept);
  } catch (err) {
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
