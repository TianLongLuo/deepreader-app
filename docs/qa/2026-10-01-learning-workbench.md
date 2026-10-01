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

- [x] 新分支全量测试：91文件516测试；TypeScript／生产构建／diff check通过（上线前关键修复后还会重跑）
- [x] 一个 fresh-context 全分支 reviewer（base1de7ae7..57232ad），3项Important均RED→GREEN并全量重跑；无Critical。词形使用独立语义核验与原文surface，旧UI回调按任务／响应隔离，混合旧出处选择可翻面语境。Minor：今日完成仍是当前复习会话计数。
- [ ] 实际已配置模型英西短样本：义项、自然分组、题目引用与表达反馈；首个文本先于 complete
- [ ] GitHub main非force同步，远端tree验证
- [ ] 真实DB一致性COPY两次迁移、旧数据逐条一致、快照／配置／storage备份
- [ ] 只更新DeepReader app与其新worker；其他站点／服务配置checksum不变
- [ ] 本地HTTP／外部HTTPS200、未登录AI401、已登录实际代理不缓冲
- [ ] 真实收藏后台完成、FSRS日志／due、实践／提示／争议、旧书及阅读记录可用

线上提交、备份目录、真实时序与结果在取得证据后补入；本记录不宣称已部署。

## 发布前服务器检查

授权的腾讯云 OrcaTerm终端只读检查：原main dad878e、DeepReader服务active／WorkingDirectory=/opt/deepreader-app、SQLite quick_check=ok、Node22.22.2／Python3.12.3、数据库路径保持file:./dev.db、磁盘可用20GB。线上原服务保持运行，未执行真实迁移、服务停机或发布。

当前Mac锁屏导致终端画面读取暂停，已请求解锁；不把尚未读到的运行环境／模型检查结果标为通过。部署脚本另加同名worker的完整身份检查，遇到非本app unit时先停止发布，不触碰该服务。
