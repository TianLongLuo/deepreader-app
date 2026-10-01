# 自动整理、词频与 AI 应用训练 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可纠正的义项分类和来源数据，用收藏词生成自然阅读与应用练习，并完成全部线上验收。

**Architecture:** 使用SQLite持久化整理任务和单并发app worker，词典／词频／人工字段分别作为证据与权威。训练生成、答题和反馈分开存储，通过第一份计划stream transport呈现，练习证据不改写识别卡排程。

**Tech Stack:** Existing Next.js、Prisma/SQLite、Node22、tsx；词频由app专用Python venv中的`wordfreq==3.1.1`进行有界批量查询；不引入Redis或Python常驻服务。

**Spec:** `docs/superpowers/specs/2026-10-01-reader-learning-workbench-design.md`。依赖前两份计划：`2026-10-01-reader-streaming.md`、`2026-10-01-vocabulary-review.md`。

## Global Constraints

- 同词同义再次收藏只新增或关联出处，保留一张识别卡；不同义项分别建卡。
- AI 未确定同义时先建待确认义项；不按拼写或相似中文摘要直接合并。
- 人工修订版本为写入前置条件，旧 AI 任务不得覆盖新修改。
- 最多一个主领域和少量辅助标签。深度最多三级；词性是筛选维度，不复制领域树。
- 通用词频、个人材料遇见次数、个人优先级分别保存。
- 没有命中显示“暂无数据”。AI 场景建议明确标记，不冒充语料统计。
- 推荐5–8个义项，可调整；默认B2；生成约200–300词短文、两道理解题及一个应用任务。
- 阅读文章只记录接触，不自动Good；应用练习不悄悄更改识别卡评分。
- 错误日志不包含 API key、原始认证内容或完整用户书籍片段。
- 上线仅更新 `app.coacheverything.tech` 的 DeepReader 项目及其数据库。

## Review Focus

1. Worker崩溃／模型配额不足时，收藏仍已保存，任务有期限和可恢复状态（Task1–2）。
2. 词频0/缺失与低频不同；归一化重音和多词搭配保留原语义（Task3）。
3. 有复习历史的两义项合并／拆分不丢日志，不把surface同形词全合并（Task2）。
4. 训练含目标拼写但含义错误、词形变化或不自然搭配时，不判定掌握（Task4–5）。
5. 生成中断、模型答案伪装引用和一题未答时，不提前透露答案／保存完成（Task4–6）。

## Shared interfaces

Consume LearningScope、SourceLanguage、MeaningLanguage、ContextMeaning、vocabularyService.capture/applySuggestion from第二份计划，以及AIStreamEvent/consumeAIStream/aiStreamResponse from第一份计划。

```ts
export type EnrichmentResult={lemma:string;selectedDictionarySenseId:string|null;
 meaning:{en?:string;zh?:string};pos:string;semanticCategory:string;
 domain:string|null;contextTags:string[];collocations:string[];uncertain:boolean};
export type PracticeMode='reading'|'application';
export type PracticeInput={mode:PracticeMode;sourceLanguage:SourceLanguage;
 definitionLanguage:MeaningLanguage;level:'B1'|'B2'|'C1';targetCount:number;
 wordCount:number;domain?:string;senseIds?:string[]};
export type PracticePublic={id:string;status:'generating'|'ready'|'failed';
 mode:PracticeMode;passage:string;targets:Array<{senseId:string;lemma:string}>;
 questions:Array<{id:string;question:string}>;applicationPrompt:string};
export type PracticeFeedback={completedIntent:boolean;priorityIssue:string|null;
 naturalExpression:string;retryPrompt:string;extraIssues:string[];
 targets:Array<{senseId:string;meaningCorrect:boolean|null;collocationNatural:boolean|null;reason:string}>};
```

### Task 1: 持久化整理任务、受控 taxonomy 与专属 worker

**Files:** Create `src/lib/vocabulary-taxonomy.ts`、`src/server/vocabulary/enrichment.ts`、`src/server/vocabulary/jobs.ts`、`scripts/learning-worker.ts`；Modify prisma/schema.prisma、vocabulary/service.ts；Test `tests/vocabulary-jobs.test.ts`、`tests/vocabulary-taxonomy.test.ts`。

**Interfaces:** `enqueueEnrichment(scope,senseId,revision):Promise<void>`、`claimJob(prisma,now):Promise<Job|null>`、`runJob(job,signal):Promise<void>`；Vocabulary service.capture在同事务写job后立即返回；不等待AI。Job lease120秒，模型任务最长90秒，active=1，最多3次自动重试（30秒、2分钟、10分钟），之后用户可显式重试。

```text
EnrichmentJob: id,userId,workspaceId,senseId,expectedRevision,status,
 attempts,availableAt,leaseUntil,errorCode,progressJson,eventVersion,createdAt,updatedAt
 unique(senseId,expectedRevision)
WordExposure: id,userId,workspaceId,documentId,sourceLanguage,lemma,location,
 sourceHash,createdAt; unique(userId,documentId,sourceLanguage,location,lemma,sourceHash)
```

- [ ] 定义固定taxonomy：daily.body.visual/hearing/sensation、daily.home.cleaning/cooking/housing、daily.travel.transport/travel/shopping、daily.social.relationships/communication/emotions、work.collaboration.meeting/mail/projects、work.marketing.ads/content/sales/conversion、work.technology.development/data/design、work.management.budget/payments/hiring、knowledge.economy/politics/science/history。semantic类别按POS使用action/perception/cognition/communication/change/state、person/object/place/event/metric/abstract等合法code，contextTags从固定户外／居家／办公／交流等列表选择。
- [ ] 写红测：未知category拒绝；两个worker同时claim同job仅一个成功；lease过期可重领；第三次失败成为failed；capture不调用provider。

```ts
it('claims a job once and keeps the saved word when the model fails',async()=>{
 const db=await createVocabularyDB();await db.seedEnrichmentJob();
 const claims=await Promise.all([claimJob(db.prisma,new Date()),claimJob(db.prisma,new Date())]);
 expect(claims.filter(Boolean)).toHaveLength(1);
 expect(await db.prisma.vocabularyEncounter.count()).toBe(1);await db.close();
});
```

- [ ] fixture增加seedEnrichmentJob，Run红后写增量schema和CAS claim。每次处理前读取user当前AI权限/config，撤销权限不继续用旧密钥；errorCode不存provider原始消息。
- [ ] worker轮询2秒，SIGTERM abort当前模型并释放lease；数据库锁失败有限重试。stdout只输出jobId/status，密钥从现有config resolver读取，不出现在命令行。
- [ ] 新建 `src/app/api/study/vocabulary/[id]/enrichment/route.ts`：GET job状态、POST retry，scope+rate限制。GET Accept:application/x-ndjson时持续订阅job进度／已解码语境释义draft／最终complete，复用第一份transport；最多每250ms持久化一次progressJson，eventVersion单调，服务端每500ms读取差异，不转存provider原始JSON或推理。关闭订阅不删除持久化job，最终结果与临时进度分开；UI词行“正在整理／待确认／重试”，词条不因job失败删除。
- [ ] Runjobs/taxonomy/scope tests；commit `feat(vocabulary): durably enrich saved words with controlled categories`。

### Task 2: 上下文义项判断、保留人工修改、合并／拆分

**Files:** Modify enrichment.ts、vocabulary/service.ts；Create `src/server/vocabulary/senses.ts`、`src/app/api/study/vocabulary/senses/route.ts`；Test `tests/vocabulary-senses.test.ts`。

**Interfaces:** `dictionarySenseId(datasetVersion,lemma,pos,definition):string` 用SHA256稳定指纹；`resolveSense(scope,senseId,result,expectedRevision):Promise<void>`；POST senses `{action:'merge',sourceIds,targetId}` 或 `{action:'split',senseId,encounterIds}`。scope/所有关联entries归属验证，模型只能选提供的dictionarySenseId，不创造任意义项ID。

- [ ] 写红测：相同确认dictionaryId合并encounters不加recognition卡；不同义项conversion营销/换算不合并；未确定null保持独立；英语/西语homograph隔离；manualRevision之后旧job冲突。

```ts
it('keeps unresolved and different confirmed meanings separate',async()=>{
 const a=await db.seedSense({lemma:'conversion',senseKey:'dictionary:marketing'});
 const b=await db.seedSense({lemma:'conversion',senseKey:'dictionary:calculation'});
 await resolveSense(scope,b.id,{...result,selectedDictionarySenseId:'dictionary:calculation'},b.revision);
 expect(await db.prisma.vocabularySense.count()).toBe(2);
});
```

- [ ] 测试文件自带result完整fixture，真实ID通过dictionarySenseId生成，不把客户端造的'dictionary:...'当合法server source。Run红。
- [ ] enrichment输入仅当前lemma候选、词典义项ID、短上下文和受控taxonomy；provider.stream消费真实流并发布job进度，schema验证结束才apply。返回uncertain或选不到ID，保留待确认语境义；允许人工选择义项及修改。恰好两条collocations，标记AI建议，不强造词根/反义词。
- [ ] auto合并仅两者确认相同dictionaryId且人工字段兼容；有冲突保留两条并提示待确认。保留所有ReviewLog原card归属，非活跃card标archived，不抛弃日志；选择既有识别卡作为active，不计算虚构合并FSRS状态。
- [ ] 用户明确split把选定encounters搬到新sense，建立新emptyCard且不复制旧历史；旧日志留原sense/card并显示操作记录。merge与split均写独立SenseChange记录，schema增加archivedAt与change表，事务失败全回滚。
- [ ] Run senses、migration、edit、concurrency；commit `feat(vocabulary): resolve contextual senses without destructive deduplication`。

### Task 3: 有来源的通用词频、材料遇见次数与个人优先级

**Files:** Create `scripts/frequency/query.py`、`scripts/frequency/requirements.txt`、`scripts/frequency/NOTICE.md`、`src/server/vocabulary/frequency.ts`、`src/server/vocabulary/exposures.ts`；Modify schema/enrichment/query及解析完成入口；Test `tests/frequency-source.test.ts`、`tests/word-exposure.test.ts`。

**Interfaces:** `lookupFrequency(words:Array<{lemma:string;language:SourceLanguage}>,signal):Promise<Array<{lemma:string;language:SourceLanguage;zipf:number|null;version:string;source:string}>>`；`recordExposures(scope,documentId,language,location,sourceText):Promise<void>`。只统计实际解析的材料位置，不在React重新paint时计数。

- [ ] 词频运行期不调用网络API，也不把wordfreq拆成缺少归一化和许可的CSV。app专用venv保留官方library和数据完整署名；Python批量查询最多100词／调用、10秒timeout、2MBstdout上限，NFC归一化，不删西语重音。

```py
import json, sys
from wordfreq import zipf_frequency
items=json.load(sys.stdin)
assert isinstance(items,list) and len(items)<=100
out=[]
for item in items:
    assert item['language'] in ('en','es')
    z=zipf_frequency(item['lemma'],item['language'])
    out.append({**item,'zipf':z if z>0 else None,'version':'wordfreq-3.1.1'})
json.dump(out,sys.stdout,ensure_ascii=False)
```

- [ ] requirements固定wordfreq==3.1.1；执行阶段pip download --dest本地app目录核验包metadata/hash，再生成含完整transitive hash的lock；venv创建仅于app目录，不apt、不系统pip。NOTICE包含作者、Apache代码许可证、CC BY-SA4.0数据、SUBTLEX署名和上游credits链接；UI／导出提供来源版本“约截至2021年快照，不是行业实时词频”。
- [ ] 写红测：0→null/暂无数据，不是rare；Zipf>=4较常见，3<=值<4一般，0<值<3较少见（标产品分档非权威难度）；无数据label unknown；保留café/cafe差异。

```ts
it('treats missing frequency as unknown rather than rare',()=>{
 expect(frequencyBand(null)).toBe('unknown');
 expect(frequencyBand(2.5)).toBe('less-common');
 expect(frequencyBand(4.2)).toBe('common');
});
```

- [ ] frequencyBand定义在frequency.ts；Node用execFile appvenv Python, args仅固定script，输入stdin，不shell拼词。结果schema validation与manifest版本校验，按lemma+language+datasetVersion缓存。scope无私有内容传出本机。
- [ ] Exposure分词同源实际位置，源hash相同重处理不增；材料变更保留新版本统计但UI“已处理材料中的出现位置数”，不宣称全站全部书都扫描过。个人priority独立字段，筛选frequency与priority不混为一类。
- [ ] Runfrequency/exposure；英文/西语实际Pythonquery smoke，未知词保留unknown；commit `feat(vocabulary): source frequency and personal exposure separately`。

来源核验：[wordfreq 官方说明与许可](https://github.com/rspeer/wordfreq/blob/master/README.md)。其代码Apache、数据CC BY-SA及附加署名，不能仅标“免费”就去掉来源。执行记录所有下载hash，不把latest URL当固定版本。

### Task 4: 有界选词、流式训练生成与答前不泄露答案

**Files:** Create `src/server/practice/types.ts`、`selector.ts`、`validator.ts`、`service.ts`、`src/app/api/study/practice/route.ts`、`src/app/api/study/practice/[id]/route.ts`；Modify schema；Test `tests/practice-selector.test.ts`、`tests/practice-generation.test.ts`。

**Interfaces:** `selectPracticeTargets(scope,input):Promise<{targets:PracticeTarget[];deferredIds:string[]}>`；`streamPractice(scope,input,signal):AsyncIterable<AIStreamEvent<PracticePublic>>`；`getPractice(scope,id):Promise<PracticePublic>`。PracticeTarget={senseId,lemma,meaning,domain,forms:string[]}来自自己的已整理义项。reading模式wordCount范围100–500、targetCount3–12，默认250／6；用户5–8建议显示，缺词不硬补其他用户词。application模式targetCount2–3，默认3，仅生成情境表达任务，passage=''、questions=[]，不强行添加短文／理解题；两模式由判别schema分别校验。

```text
LearningTask: id,userId,workspaceId,mode,sourceLanguage,definitionLanguage,
 level,targetsJson,domain,passage,questionsJson,answerKeyJson,applicationPrompt,
 validationJson,status,version,createdAt,updatedAt
LearningResponse: id,taskId,userId,workspaceId,operationId,responseJson,
 feedbackJson,usedHint,status,createdAt; unique(userId,workspaceId,operationId)
LearningEvidence: id,responseId,senseId,kind,result,reason,usedHint,createdAt
```

- [ ] 写红测：领域不匹配拆组；due/近期错/priority排序稳定；已删除文档/其他user词不进入；相同lemma不同义不能同时混入不明确文章。
- [ ] 生成mock把article拆成两chunk，assert首个delta早于结束；合法屈折forms被接受；缺目标/错引用/无两question禁止ready；流中断statusfailed不记录接触。

```ts
it('does not accept a missing target or ungrounded answer key',()=>{
 expect(()=>validatePractice({passage:'A short article.',questions:[],targets:[{lemma:'allocate',senseId:'s1',forms:['allocate','allocated']}]}))
  .toThrow();
});
```

- [ ] Runselector/generation红；实现selector按主领域成组并返回deferred理由。provider.stream生成JSON的passage字段实时显示；结束校验词边界forms、字数容差、两题、支持quote逐字对应article，再执行独立语义核验检查目标义项（不是仅词包含）。
- [ ] 有界repair最多一次，已经输出的article清楚标“正在校验”，修复后的成品替换且提示已修订，不偷偷接在原文尾部。failed保存错误状态不标ready。只有validated ready且用户实际打开／读完确认才记exposure，不算mastery。
- [ ] publicDTO去掉answerKeyJson、target meaning 和内部validation；questions只question/id，hint单独显式调用并记录usedHint。持久保存task再生成，取消后用户可重开failed task并重试，不丢收藏。
- [ ] Run新tests及scope/stream regression；commit `feat(practice): generate grounded contextual exercises as a stream`。

### Task 5: 应用任务、单重点反馈与独立能力证据

**Files:** Create `src/server/practice/feedback.ts`、`src/app/api/study/practice/[id]/answer/route.ts`、`src/app/api/study/practice/[id]/hint/route.ts`；Modify study query／practice service；Test `tests/practice-feedback.test.ts`。

**Interfaces:** `streamFeedback(scope,taskId,{operationId,answers,expression,usedHint},signal):AsyncIterable<AIStreamEvent<PracticeFeedback>>`。answers按questionId映射，每答案<=2000chars，expression<=6000；任务须ready且user ownership正确。初次请求先存response generating，重试operation同payload复用，不创建多条成绩。

- [ ] 写红测：target拼写出现但义项错返回false；正确屈折／合理表达接受；不确定评价null不得算已掌握；只有reading exposure没有active usage；hint结果独立。

```ts
it('never updates recognition scheduling from practice feedback',async()=>{
 const before=await db.prisma.reviewCard.findMany();
 await savePracticeEvidence(scope,response,{...feedback,targets:[{senseId:'s1',meaningCorrect:true,collocationNatural:true,reason:'Fits this task.'}]});
 expect(await db.prisma.reviewCard.findMany()).toEqual(before);
 expect(await db.prisma.learningEvidence.count({where:{kind:'application'}})).toBe(1);
});
```

- [ ] 定义savePracticeEvidence在feedback.ts，测试fixture显式seedreadytask/response/s1；Run红。
- [ ] feedback prompt聚焦意思／搭配／完成意图，最多一个priorityIssue，额外问题数组折叠。单重点字段按JSON顺序流式展示，最后schema和targetIds范围校验；错误不落confirmed evidence。
- [ ] 答案提交后返回答案依据，题目未提交前hidden。应用理解用AI证据带uncertainty，不用模型评分自动Good。用户可标“反馈有误”并记录disputed；再试一次生成新response关联前次，界面显示使用练习次数／最近结果而非全面已掌握。
- [ ] Runfeedback+review concurrency+practice generation；commit `feat(practice): give focused feedback and separate usage evidence`。

### Task 6: 工作台集成、全量验收、GitHub 同步及仅本app部署

**Files:** Create `src/components/study/practice-workspace.tsx`、`practice-reader.tsx`、`practice-feedback.tsx`、`scripts/qa/learning-workbench.mjs`、`scripts/deploy/deepreader-release.sh`、`scripts/deploy/deepreader-worker.service`；Modify study-library.tsx/navigation/list/detail；Record `docs/qa/2026-10-01-learning-workbench.md` 与实际部署指南。

- [ ] 写UI红测：三tab都可用、列表默认compact、筛选多维AND、单词可merge/split且确认、AI练习前看不到答案；省略classification失败不丢词。browser脚本包含真实迁移旧数据，不只固定example。

```ts
it('keeps recognition and usage labels independent',()=>{
 expect(capabilityLabels({recognition:'learning',applicationEvidence:[]}))
  .toEqual({recognition:'阅读识别：学习中',usage:'主动使用：尚未练习'});
});
```

- [ ] capabilityLabels在word-display.ts定义；Run红；实现完整practice选择→流式article→题目→表达→流式单重点反馈→立即重试，错误与停止可恢复。分类手动编辑、来源/词频详情折叠、返回原文和导出全部保留。
- [ ] 浏览器fixture验证所有流程：新词立刻保存→后台整理→手改→旧job不覆盖；两义项转换→多来源→认义复习→应用训练→两能力分开。测试日夜、中文释义/英文释义、英语/西语、窄屏/键盘、429/断流/workerrestart。
- [ ] real model小批样本验证自然分组、义项、训练目标用法、反馈不乱判；记录timing而非原始秘密。Python词频英西smoke、缺词unknown、通用频率来源署名可访问。
- [ ] 执行 `npm test`、`npx tsc --noEmit`、`npm run build`、`git diff --check`；独立whole-branch review后修复并全部重跑。验收表逐项链接证据，不凭314旧tests或build绿灯宣称新目标完成。
- [ ] GitHub先fetch检查main与基线关系；保留远端新修改，使用非force更新main。Git CLI无凭据时用现有GitHub插件create_tree/create_commit/update_ref，验证tree SHA与本地一致；只提交reviewed文件，不上传.env/DB/private fixtures。
- [ ] 部署脚本目标固定 `/opt/deepreader-app`，server只通过用户已授权的SSH通道。执行前重新确认repoHEAD、clean状态、deepreader.service、.env文件存在、DB路径、可用资源，不打印.env内容。root700新备份目录保存oldcommit、.next、DB/Storage及关键配置checksum。
- [ ] 新依赖与schema先在app备份副本演练：npm ci使用locked deps；Pythonvenv只app目录；schema runner与migrateSavedWords两次通过且legacy逐条一致。脚本事务/租约测试已通过才处理真实DB；无需安装系统包/改全局node/git/firewall。
- [ ] 部署失败rollback保留原rc，不能用echo覆盖：

```bash
set -Eeuo pipefail
rollback(){ local rc="$1"; printf 'release failed: %s\n' "$rc"; exit "$rc"; }
trap 'rc=$?; echo "FAIL_LINE=$LINENO"; rollback "$rc"' ERR
```

- [ ] 实际rollback函数实现根据阶段：代码/build失败恢复oldcommit和.next；迁移未commit回滚事务；若真实DB迁移成功，则保持增量schema用旧兼容app恢复，**不自动恢复旧DB抹掉新学习数据**。backup路径和checksum记录，无明文secret。
- [ ] Stop仅deepreader.service；systemd超时出现failed时必须MainPID0且3000端口已释放才继续，不杀其他进程。build仅本app transient unit，MemoryMax1800M/MemorySwapMax512M/CPUQuota100%/Nice10，Node heap1024MB；不要编辑nginx或现有service unit。
- [ ] 新worker unit明确归属于DeepReader，WorkingDirectory app、EnvironmentFile原.env.production、ExecStart `/root/.local/bin/node --import tsx /opt/deepreader-app/scripts/learning-worker.ts`，Restartonfailure、MemoryMax256M、CPUQuota20%、Nice10。仅该unit启停；不变更其他服务。SIGTERM测试后启用；没有新worker不会把后台整理标为可用。
- [ ] 启动app/worker，HTTP本地和HTTPS外部200、未登录AI接口401、已登录真实stream首chunk不缓冲、新收藏后台成功、复习评分/日志、practice生成/反馈。DB readonly quick_check/foreign_key_check、原书籍能打开、AI配置能工作、关键其他配置checksum不变。
- [ ] 记录部署commit、备份路径、服务状态、逐需求验收和回滚说明；commit docs。审计spec全部显式需求，确认无缺项后才update_goal complete。

## Requirement-to-task map

| Spec requirement | Owner |
| --- | --- |
| 日间默认、夜间可读性、意群覆盖／逐字对齐 | Plan1 Task1–4、8 |
| 所有现有AI流式、取消、引用验证、代理不缓冲 | Plan1 Task5–8；本计划Task1、4–6 |
| 紧凑词库、详情顺序、朗读／原文／许可 | Plan2 Task1、5–6；本计划Task6 |
| 隐藏答案、FSRS、真实日志、识别／使用分离 | Plan2 Task3–4、6；本计划Task5 |
| 旧数据无损、义项多出处、merge/split、人工优先 | Plan2 Task2、5、7；本计划Task1–2 |
| 受控分类、词频来源、个人遇见次数／优先级 | 本计划Task1、3 |
| 阅读／应用训练、自然组合、两题、单重点反馈 | 本计划Task4–6 |
| 项目边界、无秘密、GitHub与线上验证 | 三阶段全局约束及本计划Task6 |

## Self-review and handoff

三份计划一起审阅；推荐Native顺序执行，由Codex保留迁移／生产／密钥操作，Hermes仅用于隔离目录内机械非敏感工作且review后应用。执行方式由用户选择；Native的最终独立review依据requesting-code-review技能安排，不绕过review。

计划未执行；草稿UI、mock绿灯、仅本地改动和仅GitHub commit均不足以证明完整目标完成。
