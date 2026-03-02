const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * 记录操作日志
 * @param {Object} params
 * @param {number} params.userId - 操作人 ID
 * @param {string} params.action - 操作类型: CREATE | UPDATE | DELETE | PASSWORD_CHANGE
 * @param {string} params.targetType - 对象类型: GROUP | CUSTOMER | USER
 * @param {number} params.targetId - 对象 ID
 * @param {string} params.targetName - 对象名称
 * @param {Object} params.details - 变更详情（可选）
 */
async function logActivity({ userId, action, targetType, targetId, targetName, details }) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        targetName,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

module.exports = { logActivity };
