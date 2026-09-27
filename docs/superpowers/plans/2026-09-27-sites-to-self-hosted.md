# Sites to Self-hosted Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已发布 Sites 版本 7 的 UI 与功能迁入原服务器项目，验证后普通推送到 GitHub main。

**Architecture:** Next.js / Node.js 为唯一目标运行时。保留 Prisma/SQLite、本地/S3 存储与服务器后台处理；UI 和与平台无关的功能从已验证 Sites 源码移植。Cloudflare 的词库资产读取改成本地文件读取，新上传界面改接服务器既有上传接口。

**Tech Stack:** Next.js 16.2.3, React 19, TypeScript, Prisma 6, SQLite, Node.js 22, Vitest。

**Spec:** `docs/superpowers/specs/2026-09-27-sites-to-self-hosted-design.md`

## Global Constraints
- 原仓库 main 为基线，普通提交更新 main，不强制推送。
- 本次不部署用户服务器，不更改当前 Sites 网站，也不迁移线上账号、书籍或密钥。
- 不复制 D1/Drizzle 兼容层，不替换为 Prisma WASM。
- 禁止重置、清空现有数据库。
- 不提交实际 .env、密码、密钥、数据库、上传书籍或浏览器认证数据。
- 自托管词库不调用第三方词典接口，不打包和外链未经逐文件许可核实的录音。
- 以 Node.js 22 和既有 Ubuntu 部署方式验收；不强制新增 Docker 或 Redis。

## Review Focus
- 旧数据库和旧加密配置升级后应可读取，不能被初始化覆盖（任务 2、5）。
- 非管理员伪造 API 调用应被服务端拒绝，公开注册不能占用管理员身份（任务 2）。
- 移动端或极端选词位置不能挤动正文，已有尺寸偏好应继续有效（任务 3）。
- 大文件、伪造文件类型及上传失败不能留下可见的残缺书籍（任务 4）。
- 数据分片缺失、损坏或冷启动不能触发外部词典网络回退（任务 1）。

## Task 1: Node 自托管词库
**Files:** `src/server/reading-assistant/dictionary.ts`, `public/dictionaries/**`, `scripts/dictionaries/**`, `tests/dictionary*.test.ts`, `package.json`。
**Interfaces:** 保持 `lookupDictionary(rawWord, signal?, language='en'): Promise<DictionaryEntry>`，返回 `word/phonetic/meanings/sourceUrl/licenseUrl/provider`。
- [ ] 先添加 Node 文件词库测试，覆盖 `occasion`、`niño`、`casa`、缺词 404、损坏数据 503、预先取消；测试中禁用外部请求：
```ts
vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External network disabled'); }));
const entry = await lookupDictionary('occasion');
expect(entry.provider).toBe('local-wiktionary');
expect(entry.phonetic).not.toBe('');
```
- [ ] `npx vitest run tests/dictionary*.test.ts`，确认旧网络接口不能满足测试。
- [ ] 从 Sites 的 `ed422a6` 复制版本锁定词库、许可证、来源清单与校验脚本；用 `node:fs/promises.readFile` 读取 `process.cwd()/public/dictionaries/<version>/<language>/<sha256-prefix>.bin`，用 `node:zlib` 解压。仅允许已验证语言和由词哈希生成的路径，保留有界缓存、取消及错误码；无任何外部 fetch fallback。
- [ ] 运行词库完整性校验和上述测试；build 脚本在 `next build` 前执行校验，保留 `next start`。
- [ ] 提交独立词库迁移。

## Task 2: 权限和配置兼容
**Files:** `src/lib/auth.ts`, `src/lib/auth-guard.ts`, `src/server/app-config/app-config.service.ts`, `src/server/admin/dracconsole.service.ts`, `src/app/api/auth/**`, `src/app/api/dracconsole/**`, `src/app/api/settings/ai/**`, `.env.example`, `tests/registration.test.ts`, `tests/workspace-access.test.ts`, `tests/auth-guard.test.ts`。
**Interfaces:** 保持原 `AuthUser` 与 Prisma 身份/工作区查询；后台新 UI 所用配置字段必须与服务端匹配。
- [ ] 补充失败测试：未登录 401、非管理员后台 403、保留管理员账号拒绝注册、禁止用户 AI 设置时写接口 403；使用临时 SQLite/模拟配置，不使用生产账号。
- [ ] 对比两版 auth/config/admin 文件逐项迁移保护逻辑；保留 Prisma 数据访问和磁盘配置读写，不引入 Sites bindings。
- [ ] 移除原文件中的内置加密 API-key 常量及预览值；无配置时返回“未配置”，管理员环境变量仅由服务器提供。旧磁盘配置有值时必须继续读取，不以默认值覆盖。已有 `ENCRYPTION_KEY` 不变更。
- [ ] 运行注册、权限、配置回归测试及类型检查；若需要 schema 字段，先写增量迁移并用临时旧数据库验证，不执行 reset。
- [ ] 提交权限/配置兼容修改。

## Task 3: UI 和阅读器迁移
**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(dashboard)/**`, `src/components/{layout,documents,reader,settings,study,ui}/**`, `src/hooks/use-reader-store.ts`, `src/hooks/use-ui-preferences.ts`, `src/lib/ui-preferences.ts`, `src/types/reading-tools.ts`, `src/server/reading-assistant/service.ts`, `public/pdfjs/**`。
**Interfaces:** 使用原项目会话、文档 API 和阅读存储接口；迁入 `ReadingSelection`、独立单词内容和浮窗定位等纯逻辑，保持文档 id、location 与收藏格式。
- [ ] 复制 Sites 的浮窗、语言、交互、偏好、书库、格式化文本测试；先运行确认缺少新逻辑的失败点。
- [ ] 迁入这些组件及主题样式；路由页面逐个检查 import，不复制 `sites-env`、Cloudflare auth、Vinext 配置。
- [ ] 迁入精简语境提示词及缓存版本；保持段落解析能力，测试单词请求最多两句每语言、独立语言选项。
- [ ] PDF 静态资源随 `pdfjs-dist` 版本匹配；保留原 Node PDF 解析能力，客户端读取模式与现有服务端接口联合检查。
- [ ] 运行新 UI 纯逻辑测试和类型检查；在浏览器验证窄屏、贴边单词、段落模式、打开/拖动/缩放/关闭均不重排正文。
- [ ] 提交 UI 与阅读器迁移。

## Task 4: 上传与解析适配
**Files:** `src/app/(dashboard)/upload/page.tsx`, `src/app/api/documents/upload/route.ts`, `src/server/documents/document.service.ts`, `src/server/storage/{index,local.provider,s3.provider}.ts`, `src/server/parsing/**`, `tests/document-storage-failures.test.ts`, `tests/routes.test.ts`。
**Interfaces:** 服务器版使用既有 `POST /api/documents/upload` 的 `FormData(file)`，返回 `{success:true, document}`；不迁入 R2 分块实现。
- [ ] 为上传页/接口补测试：文件类型不支持 415、超过限额 413、未登录 401、其他工作区不可见；模拟存储失败后文档状态及清理行为。
- [ ] 保留新版上传页面视觉、拖放、文件状态和错误反馈，以 `XMLHttpRequest` 向原接口发送 FormData，使用 `upload.onprogress` 展示真实进度，用 `abort()` 支持取消；移除 `/api/uploads` 依赖。
- [ ] 服务端保留类型/大小限制并补充必要的文件内容检查和身份错误映射；保留本地/S3 provider 及原后台处理，不把 Workers 的限制带入服务器。
- [ ] 验证典型 EPUB/PDF 上传到本地服务后能阅读，失败可重试；用模拟大文件元数据验证限额，不写入真实大书籍。
- [ ] 提交服务器上传适配。

## Task 5: 部署文档、回归与主分支交付
**Files:** `DEPLOY.md`, `README.md`, `.env.example`, `deploy-ubuntu.sh`, `start-production.sh`, `.gitignore`, `docs/qa/2026-09-27-self-hosted-migration.md`。
**Interfaces:** `npm ci`, `npx prisma generate`, `npm test`, `npm run build`, `npm run start` 为服务器交付命令；磁盘数据库、storage 及环境文件独立于代码更新。
- [ ] 修复部署脚本依赖未提交环境模板的问题；示例只含说明或占位值。移除部署脚本对既有 AI 模型配置的无条件覆盖。
- [ ] 文档写明备份 SQLite、storage、环境文件；保留加密密钥；区分代码更新与用户数据搬迁。不得再声称公开仓库附带现有书籍、密钥或数据库。
- [ ] 验证忽略规则；扫描 staged diff，不输出或提交秘密内容。检查运行代码中无 `cloudflare:workers`、`sitesBindings`、`@prisma/client/wasm`。
- [ ] 运行并记录：
```sh
npm test
npx tsc --noEmit
npm run build
```
- [ ] 启动本地生产服务，在隔离数据库与存储目录验证注册、登录、用户隔离、配置权限、上传、EPUB/PDF、词库、浮窗及笔记；AI 使用 mock，不调用付费模型。
- [ ] 完成全分支审核并修复必要问题；提交验证记录。
- [ ] 重新获取远程 main，检查仍为已整合基线；有新提交时先整合及重测。以普通 push 更新 main，不用 `--force`，核实远程 SHA 后向用户提供提交链接。

## 自检结论
覆盖已批准方案的 UI、词库、权限、上传、部署和验证范围。旧数据库保护由任务 2/5 覆盖；认证边界由任务 2 覆盖；极端浮窗位置由任务 3 覆盖；失败上传由任务 4 覆盖；词库缺失和断网由任务 1 覆盖。选择保留标准 multipart 上传是方案允许的等价服务器流程，不复制 R2 专用功能。
