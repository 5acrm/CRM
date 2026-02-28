const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('=== CRM 系统初始化 ===\n');

  // 检查是否已有超管
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) {
    console.log('超级管理员账号已存在，跳过初始化。');
    rl.close();
    return;
  }

  const username = await ask('请设置超级管理员用户名: ');
  const password = await ask('请设置超级管理员密码（至少6位）: ');
  const displayName = await ask('请设置显示名称（可留空）: ');

  if (!username || password.length < 6) {
    console.log('用户名不能为空，密码至少6位。');
    rl.close();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      displayName: displayName || username,
      role: 'SUPER_ADMIN',
      isHidden: true,
      isActive: true
    }
  });

  console.log(`\n超级管理员账号创建成功！`);
  console.log(`用户名: ${admin.username}`);
  console.log(`显示名: ${admin.displayName}`);
  console.log('\n请保管好账号信息，此账号不会在系统用户列表中显示。');
  rl.close();
}

main()
  .catch(e => { console.error(e); rl.close(); })
  .finally(() => prisma.$disconnect());
