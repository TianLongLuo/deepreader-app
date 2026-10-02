# 学习工作台验收 — 2026-10-01

本记录区分本地确定性模型验收、真实模型验收与线上发布。尚未完成的检查不以 mock、旧测试或构建通过替代。

## 已取得的本地证据

- Reader阶段：62文件408测试；日间默认／夜间意群18种配色对比、UTF-16长段完整拆分、XHTML与混合文本、Custom Highlight不改DOM/CFI、真实上游流式传输接口、取消与缓存隔离，见 reader-streaming 记录。
- 词库／认义阶段：73文件445测试；隐藏答案、官方 ts-fsrs5.4.2、CAS／幂等评分、原始记录不改写、义项多出处，见 vocabulary-review 记录。
- 后台整理／义项修正／词频／训练与反馈阶段：独立临时 SQLite，版本化迁移、租约令牌隔离、人工版本保护、明确失败重试、人工 confirm/merge/split、离线 wordfreq3.1.1英西查询（未知词null）、材料稳定位置去重、独立语义核验、答前不返回答案、反馈不改FSRS、提示与争议留证。
- 英语阅读浏览器链：推荐3个相关词 → 250词流式草稿 → 250ms时已有文本且尚无回答框 → 校验后两题／表达 → 提交后单重点反馈。数据库3条reading-exposure与3条application，认义卡version全部0、review logs=0。
- 西语应用链：3个目标、无短文或阅读确认按钮；查看提示后表达，反馈保留usedHint，新增3条application，不增加reading-exposure。
- 浅色／深色／430px截图已实际检查：无横向溢出，正文与灰色辅助文字可读；Tab获得按钮焦点。截图存放本计划忽略的 QA 工作区，不上传用户数据。
- 429明确提示；训练断流标失败，刷新后显式重试同一任务；反馈断流原回答保留，原operation复用，不重复成绩。再次成功后共9条application，仍无认义评分。
- 暂停／恢复后台处理：收藏立即返回senseId；暂停时先保存人工释义，恢复后旧job为REVISION_CONFLICT，人工释义不变。
- 反馈有误记录为disputed；立即再试保留理解回答、清空新的表达；当前API支持重新打开自己已提交的回答，未提交任务不返回任何答案依据。
- `scripts/qa/vocabulary-migration.ts` 最新schema重复演练：legacyRecordsPreserved、duplicateSensesPreserved、manualPreserved、reviewPreserved、interruptedCopyRecovered均true，integrity=ok。

浏览器：独立 QA Chrome、回环3020、临时 SQLite、真实组件与业务服务；确定性模型只验证状态、传输及交互，**不作为语言质量的通过证据**。fixture启动执行真实旧记录迁移与原始记录逐条比较。

- 新版工作台真实浏览器认义复习：答前仅目标句与问题，Good／Again两次翻面评分，review logs=2，两张卡version=1、due分别更新；未评分卡仍version=0。

## 最终发布门

- [x] 新分支全量测试：92文件518测试；TypeScript／生产构建／diff check通过（上线前关键修复后还会重跑）
- [x] 一个 fresh-context 全分支 reviewer（base1de7ae7..57232ad），3项Important均RED→GREEN并全量重跑；无Critical。词形使用独立语义核验与原文surface，旧UI回调按任务／响应隔离，混合旧出处选择可翻面语境。Minor：今日完成仍是当前复习会话计数。
- [x] 实际已配置模型英西短样本：义项、自然分组、题目引用与表达反馈；首个文本先于 complete
- [x] GitHub main非force同步，远端tree验证
- [x] 真实DB一致性COPY两次迁移、旧数据逐条一致、快照／配置／storage备份
- [x] 只更新DeepReader app与其新worker；其他站点／服务配置checksum不变
- [x] 本地HTTP／外部HTTPS200、未登录AI401、已登录实际代理不缓冲
- [x] 真实收藏后台完成、FSRS日志／due、实践／提示／争议、旧书及阅读记录可用

## 2026-10-02 正式发布与线上验收

- 已部署代码：`79d9ac3ed42370bf18d82c05d88c9fd1d6c93328`；GitHub main 非 force 更新，远端 tree 与本地验证代码一致。
- 原提交：`dad878e0311adcb5d910c9bb044a9e9efb4a9d67`。
- 回滚备份：`/opt/deepreader-app-backups/20261002-110236-learning-79d9ac3/`。`SNAPSHOT.db` 是原始一致性快照，`COPY.db` 是两次迁移演练副本；原 reading_entries 逐条一致、重复运行幂等、完整性检查通过。
- `deepreader.service` 与新增的本应用 `deepreader-worker.service` 均 active，NRestarts=0。只新增本应用 worker；原环境文件、Nginx、原 app unit、AI 配置和书籍所有文件 SHA256 均保持一致。
- Python 3.12 主机没有 ensurepip；只在应用私有 venv 使用 SHA256 固定 pip 25.2 引导安装，不执行 apt 或修改系统 Python。英西离线词频实测 occasion=4.38、negociar=4.15、未知词=null。
- 公共模型样本 EN/ES 均经过实际已配置 DeepSeek-v4-flash 的生成、独立语义核验、反馈和词义整理。首次发现 200 词要求被写成 114/115 词，校验正确拦截；新增数值化正文长度提示后通过，未放宽校验或增加重试次数。
- HTTPS 外部登录页 200；未登录练习接口 401。真实登录态的练习流首文字 **722ms**、完成 **2512ms**、86 个文本事件；反馈首文字 **850ms**、完成 **2226ms**、36 个文本事件。确认经过线上 HTTPS 代理仍是渐进输出。
- 3 个临时收藏即时保存，真实后台 worker 全部完成；英中语境义项及离线词频保存成功。复习答前无释义，未翻面评分 409，翻面后 Good 生成 1 条 FSRS 日志、卡 version=1／due 更新。
- 应用训练、提示、反馈和“反馈有误”链路通过；练习不增加认义评分。旧书原始文件和阅读记录接口正常，原始阅读记录逐条未变化。
- 验收只使用公共样例；临时词条、练习、评分及短期会话已清理，token 没有离开服务器，没有重置任何账号。
- 浏览器确认义项／拆分有确认弹窗，拆分后来源与调整历史保留；英文释义切换通过。合并的数据完整性与接口交互由真实 SQLite／组件回归覆盖。

## 已知边界

- “今日完成”仍是当前复习会话计数，刷新或切换后会重置；持久化自然日统计作为 Minor 延后。
- AI 语言反馈可能误判合理表达；已有“反馈有误”保留争议标记，不把模型反馈自动换成 FSRS 掌握状态。
- 扫描 PDF／OCR 不在本次范围。

执行过程的技术取舍见 [决策记录](./2026-10-02-release-decisions.md)。
