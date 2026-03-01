require('dotenv').config();
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

const app = express();
const httpServer = http.createServer(app);

// Socket.io
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
initSocket(io);
app.set('io', io);

app.use(cors());
app.use(express.json());

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

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 生产环境：托管前端静态文件
const path = require('path');
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 启动定时任务（续费提醒）
scheduleRenewalReminders(io);

async function bootstrap() {
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
