# DeepReader

自托管的英文 / 西语语境阅读工具，支持 EPUB、PDF、上下文查词、段落解析、笔记和阅读进度。

本版本已迁入 Sites 的统一 UI、邻近选词浮窗、拖动缩放及尺寸记忆、独立释义语言和精简语境解释。
词库（含词形）约 102.6 万英文、74.7 万西语条目，随仓库部署，从服务器本地读取，不依赖第三方词典接口。

- 技术：Next.js 16、React 19、Node.js 22、Prisma/SQLite。
- 文件：本地磁盘 / S3；Redis 可选。
- 登录：站点自己的账号密码及管理员权限；无需 Sites / OpenAI 登录。
- AI：服务器管理员配置模型接口，密钥不包含在仓库内。

部署和旧数据升级见 [DEPLOY.md](DEPLOY.md)。不要把 `.env.production`、数据库、书籍或日志提交到 Git。

## 开发
复制 `.env.example` 为 `.env`，设置自己的值，随后：
```
npm ci
npx prisma generate
npx prisma db push
npm run dev
```
验证：`npm test`、`npx tsc --noEmit`、`npm run build`。

词库许可及来源见 [NOTICE](public/dictionaries/NOTICE.txt)。

### 词典与阅读界面
- 本地英英 / 英中、西英 / 西中释义；语言选择与浮窗右上角联动。
- 英中包含 400,468 个词头，西中包含 265,028 个词头（包含词形变化，非独立词根计数）。
- 阅读工具栏默认隐藏，顶部悬停展开、移开自动收起，不挤动正文；支持触屏按钮和键盘操作。
