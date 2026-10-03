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
- `prisma db push` 不带 `--accept-data-loss`，遇到潜在数据损失立即停止；不要加该标志绕过提示。学习工作台使用 `prisma/learning-migrations/` 的版本化 additive SQL；升级前执行下文的副本演练，不用 `db push` 代替旧站学习数据迁移。
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

请求会先核对登录、书籍所属工作区与 AI 权限。浏览器最多同时分析 2 段；每个服务进程内，按用户/工作区最多 2 个并发、每分钟 24 次新请求，超限按 Retry-After 与有界退避自动恢复，重试耗尽后提示显式重试。长段按句界拆分为不超过1200 UTF-16字符的单元，保留连续、完整原文；极长句在字符安全边界拆分。页面离开段落或关闭开关时取消未完成请求；提供商实际计费取决于其取消支持。

浏览器缓存最多 128 个成功段落，仅在本次阅读会话内保留；开关偏好保存在本浏览器。服务端启用原有 AI 缓存设置时，最多缓存 256 个成功结果、保留 24 小时，按工作区/用户/文档/语言/模型配置隔离；这是进程内缓存，重启后清空。没有后台整本书预生成任务。浏览器需支持 CSS Custom Highlight，标色不重写书籍文本或 EPUB DOM；不支持、请求失败或原文校验失败时保留原文。

## 学习工作台：升级预检与数据迁移

新版本新增语境义项、出处、FSRS 卡片／日志／会话，不覆盖 `reading_entries` 的原始 note、位置、创建时间或旧复习计数。旧计数不生成虚构的 FSRS 历史；未确认同义的同拼写词暂时分开。公开页面只有词库、复习、AI练习三个主入口，笔记／书签／保存对话在“阅读记录”。

运行环境要求 Node.js **22**（版本化迁移使用内置 node:sqlite）；`npm ci` 使用锁定的 ts-fsrs **5.4.2**，不要单独升级排程包。先在本地运行不接触生产数据库的演练：

```bash
node_modules/.bin/tsx scripts/qa/vocabulary-migration.ts
```

成功结果须包括旧记录一致、人工字段保留、评分后的卡／日志不重置、中断恢复和 integrity=ok。实际服务器仍需对真实数据库的**一致性备份副本**重复演练；本地 fixture 不替代真实副本。

### 对旧版本数据库副本执行（显式路径）

先安装锁定依赖、生成 Prisma 客户端，并按服务器实际路径设置绝对路径。以下命令只在你选定的副本上执行，脚本不会读取 DATABASE_URL 去猜生产库：

```bash
node scripts/migrate-learning-schema.mjs --database /ABSOLUTE/BACKUP/COPY.db
node_modules/.bin/tsx scripts/migrate-vocabulary.ts --database /ABSOLUTE/BACKUP/COPY.db
# 再次执行应不产生新增出处，不重置卡片和评分日志
node scripts/migrate-learning-schema.mjs --database /ABSOLUTE/BACKUP/COPY.db
node_modules/.bin/tsx scripts/migrate-vocabulary.ts --database /ABSOLUTE/BACKUP/COPY.db
```

迁移版本和 SQL SHA256 存在 learning_schema_versions；已应用 SQL 的校验和变化、外键或完整性检查失败会终止并回滚该事务。禁止在数据库副本演练前先用新版 db push 创建学习表，否则会绕过版本记录。新安装及完整发布入口以最终发布脚本为准，不把不同部署流程混用。

副本检查通过后，仅停止 DeepReader，备份数据库／`.next`／环境配置和 storage，确认端口已释放，再在原数据库上执行相同迁移。保留 `.env.production`、ENCRYPTION_KEY、账号角色、storage、既有反向代理和系统服务设置。启动后验证登录、笔记／书签／对话、查词和真实评分日志／下次到期时间。

**回滚代码与回滚数据分开：** 新增表兼容旧版代码。上线后若已产生新收藏或评分，回滚代码时保留当前数据库；恢复升级前快照会丢掉这些新记录，须由服务器拥有者明确决定，不自动恢复旧库。

主题默认日间，明确选择夜间／跟随系统仍保留；夜间意群支持低饱和配色。AI 接口使用 private/no-store/no-transform 与 X-Accel-Buffering=no 的流式响应头；真实代理是否仍缓冲必须实测，不擅自修改其他站点 Nginx 配置。

阶段二的本地验收记录见 [词库与复习验收](docs/qa/2026-10-01-vocabulary-review.md)。

### 离线词频（独立于个人优先级）

应用需 Python 3.9+ 与 venv 模块。只在 DeepReader 应用目录建立专用环境，不安装系统 pip/apt 包：

```bash
bash scripts/frequency/setup.sh
```

setup 使用 `venv --without-pip`，缺少 ensurepip 时先校验固定 pip 25.2 官方 wheel 的 SHA256，再仅在应用 venv 安装；不执行 apt，也不修改系统 Python。setup 使用完整依赖 hash 锁定文件；下载后运行期仅调用本地官方 wordfreq 3.1.1 数据，不请求网络词典或词频 API。离线安装可先按 requirements.lock 下载到应用专用 wheel 目录，再用该 venv 的 `python -m pip --no-index --find-links ... --require-hashes -r scripts/frequency/requirements.lock`。环境不可从其他机器直接搬运，需本机重建。代码 Apache 2.0，数据 CC BY-SA 4.0 及附加来源署名，完整记录见 scripts/frequency/NOTICE.md、UPSTREAM-METADATA.txt 与 /frequency/NOTICE.txt。

Zipf 产品分档：≥4 较常见，≥3 一般，>0 较少见；无数据为“暂无数据”，不当作生僻词。数据约截至2021年，不是实时或行业频率。材料遇见数仅统计已解析/完成意群分析的稳定原文位置，重复处理不增加；不是阅读次数、收藏次数或全站全部书籍统计。个人优先级另行保存和筛选。


## 完整学习工作台与工作进程

三个主入口为词库、复习、AI练习。AI练习支持阅读（100–500词、3–12个目标）与应用（2–3个目标、不生成短文）；默认 B2。系统把场景不相容或同词不同义留到下一组。生成草稿后单独调用模型检查义项和题目依据，最多修订一次；未通过的内容不计为就绪。两道理解题的答案依据只在你提交完整回答后提供。表达反馈只突出一个关键问题，可立即重试、标记反馈有误；这些记录与 FSRS 认义排程分开。

### 腾讯云现有安装的专用发布流程

这份脚本仅适用现有 `/opt/deepreader-app`、Node22 `/root/.local/bin/node`、SQLite `prisma/dev.db`、3000端口与 `deepreader.service`。其他安装不要套用它。先核对当前 main、新提交及数据库路径；发布只允许非 force 的快进。现有 Nginx／app service 配置、`.env.production`、加密密钥和 storage 不改。

```bash
# 已审阅的新提交及现场核对的旧提交均需完整40位SHA
sudo -n bash scripts/deploy/deepreader-release.sh NEW_SHA EXPECTED_OLD_SHA
```

脚本先备份原 `.next`、依赖、环境、storage 和一致性 `SNAPSHOT.db`；用独立 `COPY.db` 演练两次迁移，核对原始收藏逐条一致、卡片／日志／出处／任务不重置、外键及完整性无误。副本通过才在真实库执行版本化增量迁移，禁止 db push/reset。构建限制在本app transient unit（1800MB、1核、heap1024MB），新 worker 限制256MB、20%CPU，不修改其他服务。

worker 的唯一功能是处理已保存词汇的后台整理；关闭浏览器不会取消它。运行期只查询 app 私有离线 Python 词频环境，再流式请求已配置模型。工作进程通过有期限的租约和随机令牌逐个处理；过期租约恢复，人工修订版本不符的旧结果不会覆盖。初次失败后最多3次自动重试，之后只接受显式重试；SIGTERM 释放未完成租约。

```bash
# 发布脚本安装并启用本app自己的这个单元
sudo systemctl status deepreader.service deepreader-worker.service --no-pager
# 仅查看必要的状态；不要复制模型密钥／用户原文进公开日志
sudo journalctl -u deepreader-worker.service -n 30 --no-pager
```

### 验收与回滚

本地回归：`npm test`、`npx tsc --noEmit`、`npm run build`。隔离浏览器工作台：`node --import tsx scripts/qa/learning-workbench.mjs`，地址仅回环3020，临时数据库含真实旧记录迁移；其确定性模型只验收界面和传输，不代替真实模型语言质量检查。

发布成功后还需在 HTTPS 上实测真实模型首个文本 chunk 先于 complete、英西语义项／短文／反馈、新词整理、隐藏答案的复习和真实日志／due；同时检查词频署名、原书籍、笔记／书签／对话仍正常。未经这些检查不标记整个升级完成。

失败脚本保存最初退出码，只恢复本app旧代码／依赖／构建／原worker状态，并保留现有增量数据库；不自动用旧快照抹掉新收藏、评分或练习。备份目录位于 `/opt/deepreader-app-backups/时间-learning-SHA/`，原始快照为 `SNAPSHOT.db`、演练副本为 `COPY.db`。人工恢复快照会丢失之后新学习记录，应先保留当前库再由拥有者决定；不要把 COPY.db 当成未升级快照。

## 本次实际发布（2026-10-02）

已部署 `79d9ac3ed42370bf18d82c05d88c9fd1d6c93328`。本应用主进程与后台整理进程均 active，HTTPS／鉴权／真实流式／收藏整理／FSRS／练习验收通过。备份目录：`/opt/deepreader-app-backups/20261002-110236-learning-79d9ac3/`。原环境、AI 配置、Nginx、原服务文件及书籍校验一致；没有安装系统包。详细时序、数据保留与已知限制见 `docs/qa/2026-10-01-learning-workbench.md`。之后只更新验收文档的提交不需要重新构建运行代码。

## 本次阅读模式升级（无数据库迁移）

- 阅读方式：横向分页 / 原生纵向连续滚动（EPUB 可重排书籍）。切换保留原文 CFI 定位；固定版式 EPUB 不切换纵向，PDF 使用文本纵向阅读。
- 意群：自动维护当前视口及前后两屏，跨页/滚动继续处理。完成结果缓存和未完成排队分离；共享最多两次并发，纯预取最多一个、每分钟最多八次。后台/离线/恢复位置时暂停。
- 语义翻牌：默认关闭，英/西语原文可以选英/中/西语；同语为简明同义表达。只换当前点击的一次词，再点恢复。与意群共用但关闭旧查词/句子结构弹窗；复制、书签、笔记与上下文仍为原文。
- `Alt+Enter`：一个原词翻牌，选中整个翻牌结果则恢复；跨词不处理。`Escape`：取消待处理或恢复最近一次。偏好按账号保存；重新进入书籍不自动重放付费翻牌。
- 限流只作有限退避，配置错误暂停；显示“重试”后由用户明确重试，不无限调用。服务端同时有账号/工作区额度、短响应校验、最多一次格式修复和总时限。模型若未给出可靠短答案，原词保留。

### 现有腾讯云实例的专用发布

新脚本 `scripts/deploy/deepreader-reader-release.sh` **只适用于现有 `/opt/deepreader-app` 和 `deepreader.service`，不是首次部署安装器**。此升级不要运行旧 learning 发布/迁移脚本。

发布前完成 `docs/reader-modes-acceptance.md` 的真实浏览器、生产 bundle、真实提供商合成语义门槛及独立分支审查。精确记录线上 `OLD` 和 GitHub `main` 的 `NEW`（完整 40 位）；先确认无未提交变更。运行：

```bash
sudo bash scripts/deploy/deepreader-reader-release.sh NEW_SHA EXPECTED_OLD_SHA
```

实际部署可从已核对 `NEW` 的 Git 对象导出脚本到权限 700 的项目备份目录，校验独立 SHA256 后运行，避免为了取得脚本先变更线上 HEAD。脚本只接受 GitHub main 快进、原依赖/锁文件/Prisma schema 完全不变；校验应用 owner、Node22、service 路径、磁盘空间。

备份包含旧构建、权限限制的环境文件副本、**包含 WAL 的一致 SQLite 快照**、配置及上传文件校验清单。只停止/启动 web；worker、SSH、Nginx、密钥、系统防火墙与其它站点不修改。构建在独立临时 systemd 单元下限内存 1800M、Swap512M、CPU100%，不安装或更新系统依赖。

失败自动恢复旧代码和旧 `.next`，启动 web，保留原始失败状态并报告回滚二次失败。**不会把备份数据库覆盖回线上，也不恢复/覆盖用户上传**。构建失败期间 worker 的新写入仍保留；SQLite 快照仅供单独人工灾难恢复。成功必须含 `__READER_MODES_RELEASE_SUCCESS__`，并检查 HTTPS 登录200、新/旧保护 API401、新静态资源200、web稳定、worker原状态、数据库 quick/FK及原配置校验。

Chrome OrcaTerm 操作只在用户明确选中的终端标签进行。完成后关闭 View → Developer → Allow JavaScript from Apple Events；此开关状态要实际确认或由用户关闭，不默认声称已关闭。
