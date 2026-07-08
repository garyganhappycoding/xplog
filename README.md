# XPLog 累经簿

记录每天做的事情,按技能累积经验值(XP)和等级,支持自定义技能与等级成就、ROI(时间/精力投入 vs 产出价值)分析、功过格,以及 Daily Insights(Zettelkasten 式笔记 + 可拖拽的关系图)。

## 技术栈

- **Next.js 16**(App Router)+ React 19
- **Firebase**(Google 登录 + Firestore 实时数据库)
- **d3-force**(关系图的力导向布局与拖拽)
- **recharts**(XP 曲线图)
- **lucide-react**(图标)

## 本地开发

1. 安装依赖:

   ```bash
   npm install
   ```

2. 在 [Firebase Console](https://console.firebase.google.com/) 建一个新项目:
   - 打开 **Authentication → Sign-in method**,启用 **Google** 登录
   - 打开 **Firestore Database**,建一个数据库(生产模式)
   - 打开 **项目设置 → 你的应用 → Web app**,注册一个 Web App,复制配置

3. 复制 `.env.local.example` 为 `.env.local`,填入 Firebase 配置:

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
   ```

4. 把 `firestore.rules` 的内容贴到 Firebase Console 的 **Firestore Database → 规则**,发布规则(确保每个用户只能读写自己 uid 底下的数据)。

5. 启动开发服务器:

   ```bash
   npm run dev
   ```

   打开 http://localhost:3000,用 Google 账号登录即可开始使用。

## 部署到 Vercel

1. 把这个项目推上 GitHub(见下方"推上 GitHub"步骤)。
2. 打开 [vercel.com](https://vercel.com),用 GitHub 账号登录,点 **New Project**,选择这个仓库,Vercel 会自动识别 Next.js 项目。
3. 在 Vercel 的 **Environment Variables** 里,把 `.env.local` 里的 6 个 `NEXT_PUBLIC_FIREBASE_*` 变量原样加进去。
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
  layout.js              根布局,挂载 AuthProvider / GraphWindowProvider / AppShell
  page.js                根路径重定向到 /dashboard
  globals.css            暗金账本主题的全局样式
  dashboard/page.js       总览页
  entry/page.js           新增记录页(含新建技能)
  skill/[id]/page.js      技能详情页
  insights/page.js        Daily Insights(Kanban 笔记列表)
  reflections/page.js     反省回顾页
  merit/page.js           功过格页
components/
  AppShell.js             导航栏 + 登录门槛 + 浮动关系图窗口挂载点
  FloatingGraphWindow.js  可拖拽/缩放/最小化/最大化的关系图浮动窗口
  GraphView.js            d3-force 力导向关系图
  NoteEditor.js           全屏笔记编辑器
  TagInput.js             标签输入(打字变泡泡 + 自动建议)
  ui.js                   Pill / ProgressBar / LevelUpSeal 共用组件
context/
  AuthContext.js          Google 登录状态
  GraphWindowContext.js   浮动关系图窗口的全局状态
lib/
  firebase.js             Firebase 初始化
  useCollection.js        Firestore 实时集合 hook(增删改查)
  xp.js                   等级曲线、XP 计算等共用逻辑
```

## 数据结构(Firestore)

所有数据都存在 `users/{uid}/...` 底下,只有本人能读写:

- `users/{uid}/skills/{skillId}` — `{ name, nameEn, hasValue, milestones: [5条], totalXp }`
- `users/{uid}/entries/{entryId}` — `{ skillId, result, time, effort, value, reflection, xpGained, createdAt }`
- `users/{uid}/merits/{meritId}` — `{ type: "merit" | "demerit", text, createdAt }`
- `users/{uid}/notes/{noteId}` — `{ title, text, tags: [], category: "input" | "permanent" | "output", createdAt }`

## 关于关系图窗口

关系图(Graph View)不在页面内,而是一个**全局浮动窗口**,点导航栏的「关系图」随时可以打开:

- 拖动标题栏可以移动到屏幕任何位置
- 拖右下角可以缩放大小
- 点 `−` 缩成一个小药丸(不占空间,随时点回来)
- 点方块图示可以最大化 / 还原
- 拖拽图里任何一个节点(笔记或标签)会牵动相连的节点重新排列
