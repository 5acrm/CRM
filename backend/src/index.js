require('dotenv').config();
const { execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { initSocket } = require('./socket');
const { scheduleRenewalReminders } = require('./services/reminder');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const groupRoutes = require('./routes/groups');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const followUpRoutes = require('./routes/followups');
const translationRoutes = require('./routes/translations');
const notificationRoutes = require('./routes/notifications');
const activityLogRoutes = require('./routes/activityLogs');
const todoRoutes = require('./routes/todos');
const marketingRoutes = require('./routes/marketing');

const app = express();
const httpServer = http.createServer(app);

// Socket.io
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
initSocket(io);
app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/followups', followUpRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/marketing', marketingRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 生产环境：托管前端静态文件
const path = require('path');
const fs = require('fs');
// 优先查找 Docker 构建复制的 public 目录，其次查找开发环境的 frontend/dist
const possiblePaths = [
  path.join(__dirname, '../public'),           // Docker: /app/backend/public
  path.join(__dirname, '../../frontend/dist')   // 本地开发: frontend/dist
];
const frontendDist = possiblePaths.find(p => fs.existsSync(p));
if (frontendDist) {
  console.log('前端静态文件路径:', frontendDist);
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('警告：未找到前端静态文件，已检查路径:', possiblePaths);
}

// 启动定时任务（续费提醒）
scheduleRenewalReminders(io);

async function bootstrap() {
  // 自动同步数据库 schema
  console.log('正在同步数据库 schema...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  console.log('数据库 schema 同步完成。');

  // 自动创建 superadmin（如果不存在）
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (!existing) {
      const hash = await bcrypt.hash('xqd888999', 10);
      await prisma.user.create({
        data: {
          username: 'xqd',
          passwordHash: hash,
          displayName: 'xqd',
          role: 'SUPER_ADMIN',
          isHidden: true,
          isActive: true
        }
      });
      console.log('超级管理员账号已创建：xqd');
    } else {
      console.log('超级管理员账号已存在，跳过创建。');
    }
  } finally {
    await prisma.$disconnect();
  }
}

const PORT = process.env.PORT || 3001;

bootstrap().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`CRM 后端运行在 http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('启动失败：', err);
  process.exit(1);
});
