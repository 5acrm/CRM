const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { sendNotification } = require('../socket');

const prisma = new PrismaClient();

function scheduleRenewalReminders(io) {
  // 每天早上 9:00 检查 3 天内到期的账号
  cron.schedule('0 9 * * *', async () => {
    console.log('检查 WhatsApp 账号续费提醒...');
    try {
      const now = new Date();
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const expiringAccounts = await prisma.waAccount.findMany({
        where: {
          renewalDate: { gte: now, lte: in3Days },
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

  // 跟进提醒检查（每5分钟）
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const dueReminders = await prisma.followUpReminder.findMany({
        where: {
          scheduledAt: { lte: now },
          isCompleted: false
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true } }
        }
      });

      for (const reminder of dueReminders) {
        const customerName = reminder.customer?.name || reminder.customer?.phone || '客户';

        // Create notification
        const notification = await prisma.notification.create({
          data: {
            userId: reminder.userId,
            type: 'FOLLOWUP_REMINDER_DUE',
            title: '跟进提醒',
            content: `${customerName}：${reminder.content}`,
            relatedId: reminder.customerId
          }
        });

        // Send via socket
        sendNotification(io, reminder.userId, notification);

        // Mark as completed to avoid re-notifying
        await prisma.followUpReminder.update({
          where: { id: reminder.id },
          data: { isCompleted: true }
        });
      }
    } catch (err) {
      console.error('跟进提醒检查失败：', err.message);
    }
  }, { timezone: 'Asia/Shanghai' });

  console.log('跟进提醒定时任务已启动（每5分钟检查）');
}

module.exports = { scheduleRenewalReminders };
