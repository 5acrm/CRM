// 角色权重（数字越大权限越高）
const ROLE_WEIGHT = {
  MEMBER: 1,
  TRANSLATOR: 1,
  TEAM_LEADER: 2,
  SUPERVISOR: 3,
  DEPT_MANAGER: 4,
  ADMIN: 5,
  SUPER_ADMIN: 6
};

// 要求至少某个角色级别
function requireRole(...roles) {
  return (req, res, next) => {
    const userWeight = ROLE_WEIGHT[req.user.role] || 0;
    const minWeight = Math.min(...roles.map(r => ROLE_WEIGHT[r] || 99));
    if (userWeight >= minWeight) {
      return next();
    }
    return res.status(403).json({ message: '权限不足' });
  };
}

// 检查是否可以移动客户（组长及以上）
function canMoveCustomer(req, res, next) {
  const allowed = ['TEAM_LEADER', 'SUPERVISOR', 'DEPT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
  if (allowed.includes(req.user.role)) return next();
  return res.status(403).json({ message: '只有组长及以上权限才能移动客户' });
}

// 构建用户可见范围的条件
function buildVisibilityFilter(user) {
  const role = user.role;

  // 超管、管理员看所有
  if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return {};
  }

  // 翻译看所有客户
  if (role === 'TRANSLATOR') {
    return {};
  }

  // 部门经理看本部门
  if (role === 'DEPT_MANAGER') {
    return { createdBy: { departmentId: user.departmentId } };
  }

  // 主管看自己和下属
  if (role === 'SUPERVISOR') {
    return {
      createdBy: {
        OR: [
          { id: user.id },
          { superiorId: user.id },
          { superior: { superiorId: user.id } }
        ]
      }
    };
  }

  // 组长看自己和组员
  if (role === 'TEAM_LEADER') {
    return {
      createdBy: {
        OR: [
          { id: user.id },
          { superiorId: user.id }
        ]
      }
    };
  }

  // 组员只看自己的
  return { createdById: user.id };
}

module.exports = { requireRole, canMoveCustomer, buildVisibilityFilter, ROLE_WEIGHT };
