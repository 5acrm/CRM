# CRM 客户管理系统

## 项目说明
这是一个网页版客户管理系统（CRM），已部署到 Railway 云平台，供公司内部使用。
面向加密货币投资团队（6-50人），通过 WhatsApp 群组引流，管理群组数据、客户跟进、财务记录、翻译服务等。

## 线上地址
- **生产环境**：https://crm-production-cb28.up.railway.app
- **平台**：Railway（Docker 部署，自动从 GitHub main 分支触发）
- **代码仓库**：https://github.com/5acrm/CRM

## 用户规模
6-50 人同时使用

## 技术栈
- **后端**: Node.js + Express.js（端口 3001）
- **数据库**: PostgreSQL + Prisma ORM（Railway PostgreSQL 插件，env: POSTGRES_URL）
- **前端**: React + Ant Design v5 + Vite（构建后由后端托管）
- **实时通知**: Socket.io
- **认证**: JWT + bcrypt

## 目录结构
```
c:\CRM\
├── backend/
│   ├── src/
│   │   ├── index.js              # 后端入口（端口 3001）
│   │   ├── socket.js             # Socket.io 实时通知
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT 验证
│   │   │   └── permission.js     # 角色权限（ROLE_WEIGHT, buildVisibilityFilter）
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── users.js          # 含 /translators 端点；主管/组长可管理下属
│   │       ├── customers.js      # 支持 viewMode=mine/all；关联WA账号多对多
│   │       ├── groups.js         # 支持 viewMode=mine/all
│   │       ├── accounts.js       # WhatsApp 账号；支持 viewMode=mine/all
│   │       ├── transactions.js   # 财务（CRUD/viewMode/groupNumber/assignedUserId筛选）
│   │       ├── followups.js      # GET/POST/PUT；GET /customer/:id；建议/回应
│   │       ├── translations.js   # 翻译（指定翻译员/全员推送）
│   │       └── notifications.js  # 通知（含 customerId 关联，支持跳转）
│   └── prisma/
│       ├── schema.prisma
│       └── seed.js
├── frontend/
│   └── src/
│       ├── api/index.js          # 所有 API 调用封装
│       ├── store/auth.js         # 角色标签/权重常量
│       ├── data/usStates.js      # 美国50州+城市+时区（中文）
│       └── pages/
│           ├── Login/
│           ├── Dashboard/
│           ├── Customers/        # CustomerList + CustomerDetail
│           ├── FollowUps/        # 全量跟进记录（按权限）；可展开查看详情
│           ├── Groups/
│           ├── Accounts/
│           ├── Transactions/
│           ├── Translations/
│           ├── Notifications/
│           └── Admin/            # 主管/组长可见（管理下属用户）
├── start.bat                     # 生产启动（构建前端 + 启动后端）
└── CLAUDE.md
```

## 角色权限体系
| 角色 | 权重 | 说明 |
|------|------|------|
| SUPER_ADMIN | 6 | 超级管理员，看所有数据 |
| ADMIN | 5 | 管理员，看所有数据 |
| DEPT_MANAGER | 4 | 部门经理，看本部门 |
| SUPERVISOR | 3 | 主管，看自己+团队；可新增/编辑组长和组员 |
| TEAM_LEADER | 2 | 组长，看自己+下属；可新增/编辑组员；可看系统管理 |
| MEMBER | 1 | 组员，只看自己 |
| TRANSLATOR | 1 | 翻译，看所有客户；可点击查看客户详情/添加跟进记录 |

- **viewMode=mine**（默认）：只看自己的数据（客户、群组、WhatsApp账号均支持）
- **viewMode=all**：按角色权限范围显示

## 重要规则
- **用户不懂技术**，所有决定由 Claude 做出
- **沟通语言**：中文
- **代码注释**：中文或英文均可
- PostgreSQL 数据库（Railway 插件托管，env 变量名 `POSTGRES_URL`，schema.prisma 中 `url = env("POSTGRES_URL")`）
- Prisma 枚举字段用 String 类型（历史原因，从 SQLite 迁移而来）
- 前端全中文化：dayjs locale=zh-cn，Ant Design locale=zh_CN，美国州/城市/时区均为中文
- 遇到问题先解决，不要问太多问题

## 部署方式（Railway）
推送代码到 GitHub → Railway 自动构建并部署（约 3-5 分钟）

```bash
# 推送代码（需要 GitHub token）
git add .
git commit -m "描述改动"
git remote set-url origin "https://5acrm:TOKEN@github.com/5acrm/CRM.git"
git push origin main
git remote set-url origin "https://github.com/5acrm/CRM.git"  # 清除 token
```

Railway 环境变量（Variables 标签）：
- POSTGRES_URL=${{Postgres.DATABASE_URL}}（引用 PostgreSQL 插件连接字符串，schema.prisma 用此变量名）
- JWT_SECRET=crm2024xqdsecretkey
- PORT=3001

启动命令（Dockerfile CMD）：
```
npx prisma db push --accept-data-loss && node src/index.js
```
启动时自动创建 superadmin（xqd/xqd888999）。数据库 URL 从环境变量 POSTGRES_URL 读取。

## 本地开发启动
```
# 后端
cd C:\CRM\backend && node src/index.js

# 前端（开发模式）
cd C:\CRM\frontend && npm run dev

# 重新生成 Prisma 客户端（改 schema 后需要，先停止后端）：
rm -f "C:\CRM\backend\node_modules\.prisma\client\query_engine-windows.dll.node"
cd C:\CRM\backend && npx prisma generate
cd C:\CRM\backend && npx prisma db push
```

## 常见问题
- **Prisma DLL 锁定错误**（EPERM rename）：先停止后端，删除 DLL 文件，再 `prisma generate`
- **服务器错误 500**：查看后端终端日志（已加 console.error），确认 Prisma 客户端是否需要重新生成
- **团队数据显示为空**：检查 `api/index.js` 中对应 API 是否传递了 `params`

## 超管账号
- 用户名: xqd
- 密码: xqd888999
- 每次部署时若不存在则自动创建（index.js bootstrap 函数）

## 数据模型要点
- **Customer** 新增字段：usState / usCity / timezone / remark（美国州城市时区+备注）
- **Customer 与 WaAccount** 是多对多关系，通过 `CustomerWaAccount` 表（含 addedById 记录添加人）
  - 旧的 `primaryWaAccountId` 已废弃，改用 `waAccountLinks`
  - 每人只能关联自己的账号（后端校验 userId === req.user.id）
- **CustomerWaAccount** 字段：customerId / waAccountId / addedById / createdAt
- **WaGroup** 新增字段：remark（备注）
- **续费提醒** 只发给账号所属人（reminder.js 中发送给 account.userId）
- **FollowUpRecord** 支持编辑（PUT /followups/:id，仅本人或管理员）
- **Transaction** 支持编辑/删除（PUT/DELETE /transactions/:id）

## 当前进度（2026-03-02）
- [x] 后端所有路由模块开发完成
- [x] 前端所有页面开发完成
- [x] WhatsApp 账号管理（搜索/续费/删除/mine-all视图切换）
- [x] WhatsApp 群组管理（合并/类型属性/月度成本/mine-all视图切换/搜索/统计/备注）
- [x] 客户管理（注册/实名/矿池授权/mine-all/跟进记录列/美国州城市时区/备注/负责人变更）
- [x] 客户关联WA账号（多选；多对多 CustomerWaAccount 表；仅可关联自己的账号）
- [x] 跟进记录板块（全量列表/权限过滤/可展开/可跳转/可编辑）
- [x] 财务模块（BTC/ETH 手动 USD/月度筛选/角色可见范围/编辑/删除/viewMode/筛选）
- [x] 翻译服务（指定翻译员/全员推送/翻译员可查看关联客户详情）
- [x] 通知中心（点击跳转客户详情；所有通知均有已读按钮；翻译推送也可跳转）
- [x] 用户管理（小组编号/改密码/删除；主管可管组长+组员；组长可管组员）
- [x] 角色权限可见范围修复（viewMode 默认显示自己数据）
- [x] 数据总览个人/团队切换（组长及以上）
- [x] 操作日志仅超级管理员可见
- [x] 群组数据弹窗汇总统计+百分比（退群率/咨询率/成交率）
- [x] 全系统中文化（dayjs zh-cn/美国州城市时区中文/Ant Design zh_CN）
- [x] 部署到 Railway（Docker + GitHub 自动部署）
- [x] 超管账号自动创建（xqd/xqd888999）
- [x] 数据库从 SQLite 迁移到 PostgreSQL（数据持久化，env: POSTGRES_URL）
- [ ] 绑定自定义短域名（可选）

## GitHub 推送
- 推送时临时设置 remote URL 附带 token，推送后立即清除
- token 保存在 MEMORY.md 中，不可写入代码仓库
