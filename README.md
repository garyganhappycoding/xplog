# XPLog 累经簿

记录每天做的事情,按技能累积经验值(XP)和等级,支持自定义技能与等级成就、ROI(时间/精力投入 vs 产出价值)分析、功过格。四个底部导航标签:待办(项目分组)、日记(AI 自动判断技能与 XP)、技能成长(雷达图 + 技能列表)、关系图(日记与技能的可拖拽力导向图)。

## 技术栈

- **Next.js 16**(App Router)+ React 19
- **Firebase**(Google 登录 + Firestore 实时数据库 + Storage 图片存储)
- **xAI Grok API**(日记自动打标签:推断技能 + XP)
- **Notion API**(标记 #idea 的日记条目自动同步到 Notion 的 Idea Vault 数据库)
- **d3-force**(关系图的力导向布局与拖拽)
- **recharts**(XP 曲线图 / 雷达图)
- **lucide-react**(图标)

## 本地开发

1. 安装依赖:

   ```bash
   npm install
   ```

2. 在 [Firebase Console](https://console.firebase.google.com/) 建一个新项目:
   - 打开 **Authentication → Sign-in method**,启用 **Google** 登录
   - 打开 **Firestore Database**,建一个数据库(生产模式)
   - 打开 **Storage**,启用 Storage(用于日记照片上传)
   - 打开 **项目设置 → 你的应用 → Web app**,注册一个 Web App,复制配置

3. 在 [x.ai](https://x.ai/) 申请一个 Grok API key(用于日记自动打标签)。

4. (可选)如果要用「日记打 #idea 标签自动同步到 Notion Idea Vault」功能:
   - 去 [notion.so/my-integrations](https://www.notion.so/my-integrations) 建一个 internal integration,复制它的 secret(以 `ntn_` 或 `secret_` 开头)。
   - 打开 Notion 里的 Idea Vault 数据库,右上角 `···` → **Connections**,把刚建的 integration 加进去(不加的话 API 调用会报权限错误)。
   - Idea Vault 的 data source ID 就是 `0becc330-4e93-4c07-9bfe-880c15d4de6b`(已经在共享给 Claude 的 workspace 里确认过)。

5. 复制 `.env.local.example` 为 `.env.local`,填入配置:

   ```bash
   cp .env.local.example .env.local
   ```

   填入类似:

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   XAI_API_KEY=xai-...
   NOTION_API_KEY=ntn_...
   NOTION_IDEA_VAULT_DATA_SOURCE_ID=0becc330-4e93-4c07-9bfe-880c15d4de6b
   ```

   Notion 这两项留空也没关系,只是 #idea 标签的日记不会同步过去,其它功能不受影响。

6. 把 `firestore.rules` 的内容贴到 Firebase Console 的 **Firestore Database → 规则**,把 `storage.rules` 的内容贴到 **Storage → 规则**,分别发布(确保每个用户只能读写自己 uid 底下的数据)。

7. 启动开发服务器:

   ```bash
   npm run dev
   ```

   打开 http://localhost:3000,用 Google 账号登录即可开始使用。

## 部署到 Vercel

1. 把这个项目推上 GitHub(见下方"推上 GitHub"步骤)。
2. 打开 [vercel.com](https://vercel.com),用 GitHub 账号登录,点 **New Project**,选择这个仓库,Vercel 会自动识别 Next.js 项目。
3. 在 Vercel 的 **Environment Variables** 里,把 `.env.local` 里的 6 个 `NEXT_PUBLIC_FIREBASE_*` 变量、`XAI_API_KEY`,以及(如果用了 Notion 同步)`NOTION_API_KEY` 和 `NOTION_IDEA_VAULT_DATA_SOURCE_ID` 原样加进去。
4. 点 **Deploy**,几分钟后会拿到一个 `xxx.vercel.app` 的网址。
5. 回到 Firebase Console → Authentication → Settings → **Authorized domains**,把这个 Vercel 网址加进去(否则 Google 登录会报错)。

## 推上 GitHub

```bash
cd xplog
git init
git add .
git commit -m "XPLog v1"
git branch -M main
git remote add origin https://github.com/你的用户名/xplog.git
git push -u origin main
```

## 项目结构

```
app/
  layout.js              根布局,挂载 AuthProvider / AppShell
  page.js                根路径重定向到 /todo
  globals.css            暗金账本主题的全局样式
  api/tag-entry/route.js 日记自动打标签(调用 Grok API)
  api/sync-idea/route.js 把打了 #idea 标签的日记同步到 Notion Idea Vault
  todo/page.js            待办(项目分组)
  diary/page.js           日记(AI 自动打标签)
  skills/page.js          技能成长(雷达图 + 技能列表)
  graph/page.js           关系图(日记 ↔ 技能 的力导向图)
  entry/page.js           详细记录表单(时间/精力/产出价值,ROI 用)
  skill/[id]/page.js      技能详情页
  reflections/page.js     反省回顾页(未接入底部导航,可直接访问)
  merit/page.js           功过格页(未接入底部导航,可直接访问)
components/
  AppShell.js             顶部栏 + 底部导航 + 登录门槛
  CreateSkillForm.js      新建技能表单(entry 页与 skills 页共用)
  GraphView.js            d3-force 力导向图(日记 ↔ 技能)
  EmojiPicker.js          技能图标选择器
  ui.js                   Pill / ProgressBar / LevelUpSeal / ConfirmDialog 共用组件
context/
  AuthContext.js          Google 登录状态
lib/
  firebase.js             Firebase 初始化(Auth / Firestore / Storage)
  useCollection.js        Firestore 实时集合 hook(增删改查)
  xp.js                   等级曲线、XP 计算等共用逻辑
```

## 数据结构(Firestore)

所有数据都存在 `users/{uid}/...` 底下,只有本人能读写:

- `users/{uid}/skills/{skillId}` — `{ name, nameEn, hasValue, milestones: [5条], totalXp }`
- `users/{uid}/entries/{entryId}` — `{ skillId, result, time, effort, value, reflection, xpGained, createdAt }`
- `users/{uid}/merits/{meritId}` — `{ type: "merit" | "demerit", text, createdAt }`
- `users/{uid}/projects/{projectId}` — `{ name, color?, createdAt, order }`
- `users/{uid}/todos/{todoId}` — `{ projectId, text, done, createdAt, dueDate? }`
- `users/{uid}/diaryEntries/{entryId}` — `{ text, photoUrl?, tags: [], skill, skillId, xpDelta, aiTagged, confidence, createdAt, notionPageId? }`

## Notion 同步(Idea Vault)

日记条目打上 `idea` 标签(在标签框里输入 `：idea`)后,会自动在 Notion 的 **Idea Vault** 数据库里创建一条记录:

- `Name` = 日记开头前 80 字
- `Notes` = 完整日记正文
- `Status` = `Inbox`(走 Idea Vault 原本的 Inbox → Reviewed → Organized 流程)
- `Skill` = 这篇日记被打上的技能(新加的字段,multi-select 类型;技能名第一次出现时会自动变成新选项)
- `XPLog ID` = 日记的 Firestore 文档 ID(新加的字段,防止重复同步)
- `Screenshot` = 日记照片(如果有)

只在标签第一次变成包含 `idea` 时同步一次(记录在 `diaryEntries.notionPageId` 上),之后编辑日记正文或技能不会再更新 Notion 那边的记录。没配置 `NOTION_API_KEY` / `NOTION_IDEA_VAULT_DATA_SOURCE_ID` 的话,打 `idea` 标签就只是本地标签,不会报错也不会同步。

## 关于关系图

「关系图」是底部导航的第四个标签,展示日记条目与它们被 AI(或手动)打上的技能标签之间的关系:

- 力导向布局(d3-force),会自动排列
- 拖拽图里任何一个节点(日记或技能)会牵动相连的节点重新排列
- 只有已经打上技能标签的日记才会出现在图里
