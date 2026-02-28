const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录，请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { department: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: '账号已禁用或不存在' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
}

module.exports = { authenticate };
