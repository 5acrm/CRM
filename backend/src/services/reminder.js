const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { sendNotification } = require('../socket');

const prisma = new PrismaClient();

function scheduleRenewalReminders(io) {
  // 每天早上 9:00 检查 28 天内到期的账号
  cron.schedule('0 9 * * *', async () => {
    console.log('检查 WhatsApp 账号续费提醒...');
    try {
      const now = new Date();
      const in28Days = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

      const expiringAccounts = await prisma.waAccount.findMany({
        where: {
          renewalDate: { gte: now, lte: in28Days },
          isActive: true,
          isPermanentBan: false
        },
        include: { user: true }
      });

      for (const account of expiringAccounts) {
        const daysLeft = Math.ceil((new Date(account.renewalDate) - now) / (1000 * 60 * 60 * 24));
        const notif = await prisma.notification.create({
          data: {
            userId: account.userId,
            type: 'RENEWAL_REMINDER',
            title: 'WhatsApp 账号续费提醒',
            content: `账号 ${account.nickname || account.phoneNumber} 还有 ${daysLeft} 天到期，请及时续费`,
            relatedId: account.id
          }
        });
        sendNotification(io, account.userId, notif);
      }

      console.log(`已发送 ${expiringAccounts.length} 条续费提醒`);
    } catch (err) {
      console.error('续费提醒任务出错:', err.message);
    }
  }, { timezone: 'Asia/Shanghai' });

  console.log('续费提醒定时任务已启动（每天 09:00 检查）');
}

module.exports = { scheduleRenewalReminders };
