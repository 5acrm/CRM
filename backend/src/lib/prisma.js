const { PrismaClient } = require('@prisma/client');

// 全局单例 PrismaClient，避免每个路由文件创建新的连接池
const prisma = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
