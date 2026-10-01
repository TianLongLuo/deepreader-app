# 自建服务器部署（Ubuntu / Node.js 22）

本仓库包含完整应用及自托管词库，不包含用户数据库、书籍、账号密码或 AI 密钥。
运行方式：Next.js + Prisma/SQLite；本地磁盘或 S3 存储；Redis 缓存可选。

## 首次部署
1. 安装 Node.js 22、npm 和 Git，克隆本仓库。
2. `cp .env.example .env.production && chmod 600 .env.production`。
3. 编辑 `.env.production`：
   - `DATABASE_URL="file:./dev.db"`（相对路径基于 `prisma/`；也可以使用绝对路径）。
   - `ENCRYPTION_KEY`：用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成一次，安全保存。
   - 设置 `ADMIN_EMAIL`、`ADMIN_LOGIN_NAME`（默认 Lone）；不要使用公开对话中出现过的密码。
   - 运行 `npm ci`，执行 `read -rs PASSWORD; printf %s "$PASSWORD" | node scripts/admin-password.mjs; unset PASSWORD` 生成 bcrypt 哈希，填入 `ADMIN_PASSWORD_HASH`，用双引号包围。不要把原始密码放到命令参数、Git 或日志中。
   - `APP_BASE_URL` 填写 HTTPS 域名。首次成功使用管理员用户名与对应密码登录时才初始化管理员；不会覆盖已有账号。
4. `chmod +x deploy-ubuntu.sh start-production.sh stop-production.sh`，执行 `./deploy-ubuntu.sh`。
5. 配置 HTTPS 反向代理，转发到本地 3000 端口。登录 Cookie 在生产环境要求 HTTPS，直接 HTTP IP 登录不作为生产部署方式。

AI 密钥在管理员后台配置。注册后可直接阅读；能否使用共享 AI / 修改个人 AI 设置由管理员控制。无外部词典接口依赖，已有释义与音标随站点文件提供；AI 语境解析仍需要模型服务。

## 反向代理示例
在已有 HTTPS Nginx server 块中设置：
```
client_max_body_size 200m;
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 300s;
}
```
阻止公网直接访问 3000；将 `AUTH_TRUST_PROXY="true"`，只信任由该代理覆盖的 `X-Real-IP`。未配置可信代理时，请求共享保守的 IP 限流桶；账号另有限流。不要直接信任客户端传入的 IP 头。

## 更新旧服务器（先备份）
- 停止服务；备份 SQLite 数据库、`storage/`、`.env.production`，数据库应在停机后备份，或使用 SQLite 一致性备份。
- **保留原 ENCRYPTION_KEY**，否则原 AI 密钥无法解密；不要用新的示例覆盖旧环境文件。
- 保留原数据库和 storage 路径。管理员邮箱应与旧管理员身份一致；已有账号不会被初始化逻辑覆盖。
- 拉取新 main 后执行部署脚本。脚本不再修改原 AI 模型配置。
- `prisma db push` 不带 `--accept-data-loss`，遇到潜在数据损失立即停止；不要加该标志绕过提示。本次仅增加 `auth_attempts` 限流表。
- 回滚：停服务，检出升级前提交，恢复备份数据库/配置/书籍，再安装、生成 Prisma、构建并启动。不要恢复代码却混用不兼容的数据快照。

## 手动启动 / 验证
```
npm ci
node --env-file=.env.production node_modules/prisma/build/index.js generate
node --env-file=.env.production node_modules/prisma/build/index.js db push --skip-generate
npm run build
npm run start
```
部署必须保留 `public/` 和 `scripts/dictionaries/sources.json` 等工程文件，不要只复制 `.next/`。
构建自动校验 1024 个词库分片。日志在 `logs/`，停止/启动使用配套脚本。大型多用户站点可另行规划数据库和进程管理扩容，本版默认单机 SQLite。

## 数据来源
词库来自 Wiktionary / Compact Dictionaries，许可、来源、下载校验及变更声明见 `public/dictionaries/NOTICE.txt`。更新词库使用 `scripts/dictionaries/import.py`，日常构建和查词不下载外部词典。缺失的音标不编造；外部录音未打包。

### 旧版管理员角色
后台现在只认可数据库中的 `ADMIN` 角色，不再仅凭 `admin@qq.com` 邮箱放行。升级前请核对现有管理员的角色；若旧账号依赖邮箱特例，请由服务器拥有者备份数据库后明确设置该账号的 `role` 为 `ADMIN`。部署和公开注册不会自动提升已有账号权限。

旧账号登录继续使用既有密码校验规则；8 字符/72 字节限制只针对新注册。旧邮箱大小写不改写；若数据库中已有仅大小写不同的两个账号，请使用各自原始邮箱拼写登录，系统不会自动合并账号或书库。

### 从曾跟踪运行配置的旧版本升级
旧仓库曾把 `storage/system/app-config.json`（含加密密钥配置及预览）纳入 Git；本版本停止跟踪该文件。**拉取前先把此文件备份到仓库外，拉取后恢复到原路径，再启动服务**，否则未修改的旧跟踪文件可能被 Git 删除。新安装不自带任何模型密钥。历史提交中的旧配置仍存在，建议在提供商后台轮换曾写入仓库的密钥，然后在管理员后台重新保存。

## 中文释义词库
英中采用 ECDICT（MIT），西中采用中文维基词典 / Kaikki（CC BY-SA 4.0）。词库已随仓库提供，查词不调用在线词典或 AI。切换浮窗右上角的英中/西中释义即可查询中文；未收录时明确提示，不会静默显示英文。词头数包含词形变化，并非独立词根数量。原始中文可能包含简体及繁体。导入来源、校验和见 `scripts/dictionaries/chinese-sources.json`，许可见 `public/dictionaries/NOTICE.txt`。

阅读顶部工具栏默认隐藏，鼠标移到顶部时展开、移开后自动收起，不改变正文布局。触屏可点右上角展开按钮，键盘可用 Tab 进入、Esc 收起。查词浮窗以所在段落为避让区域，留出段落间距；空间不足时仍可拖动调整。

## 意群阅读更新
此功能无需新增环境变量或数据库迁移，沿用后台已有 AI 权限和模型配置。拉取最新 `main` 后重新构建并重启服务即可使用；未配置 AI 时普通阅读和本地词典仍可使用。

顶部阅读工具栏的「意群阅读」默认关闭；勾选后分析当前可见的英文/西语段落，适用于 EPUB 和 PDF「随屏排版」文本视图，不包含扫描 PDF/OCR 或原 PDF 画布标色。分组由模型生成，可能存在语言学偏差，不视为权威语法标注。

请求会先核对登录、书籍所属工作区与 AI 权限。浏览器最多同时分析 2 段；每个服务进程内，按用户/工作区最多 2 个并发、每分钟 24 次新请求，超限暂停并提示手动重试。超过 4000 字符的单段保留原文。页面离开段落或关闭开关时取消未完成请求；提供商实际计费取决于其取消支持。

浏览器缓存最多 128 个成功段落，仅在本次阅读会话内保留；开关偏好保存在本浏览器。服务端启用原有 AI 缓存设置时，最多缓存 256 个成功结果、保留 24 小时，按工作区/用户/文档/语言/模型配置隔离；这是进程内缓存，重启后清空。没有后台整本书预生成任务。浏览器需支持 CSS Custom Highlight，标色不重写书籍文本或 EPUB DOM；不支持、请求失败或原文校验失败时保留原文。
