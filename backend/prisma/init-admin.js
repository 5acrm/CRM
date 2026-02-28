// 临时初始化脚本，运行一次后可删除
// 用法: node prisma/init-admin.js <用户名> <密码> <显示名>
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const [,, username, password, displayName] = process.argv

  if (!username || !password) {
    console.log('用法: node prisma/init-admin.js <用户名> <密码> [显示名]')
    process.exit(1)
  }

  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  if (existing) {
    console.log('超级管理员已存在，账号:', existing.username)
    process.exit(0)
  }

  const hash = await bcrypt.hash(password, 10)
  const admin = await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      displayName: displayName || username,
      role: 'SUPER_ADMIN',
      isHidden: true,
      isActive: true
    }
  })

  console.log('✅ 超级管理员账号创建成功')
  console.log('   用户名:', admin.username)
  console.log('   显示名:', admin.displayName)
}

main().catch(console.error).finally(() => prisma.$disconnect())
