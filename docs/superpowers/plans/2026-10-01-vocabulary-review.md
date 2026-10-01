# 语境词库与 FSRS 复习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将收藏页转成精简的语境词库和真正隐藏答案的复习，同时无损保留旧记录。

**Architecture:** 原 ReadingEntry 作为兼容证据留存，增量增加义项、出处、卡片、日志及复习会话实体。服务端 FSRS 排程、事务及幂等评分，前端将词库管理和单卡复习分离。

**Tech Stack:** Existing Next.js／Prisma 6／SQLite／Vitest；执行阶段固定安装 `ts-fsrs@5.4.2`（npm registry 于2026-10-01查得，Node >=20；当前服务器Node22兼容）。不引入FSRS optimizer。

**Spec:** `docs/superpowers/specs/2026-10-01-reader-learning-workbench-design.md`，用户已批准。前置计划 `2026-10-01-reader-streaming.md`；后续 `2026-10-01-learning-practice.md`。

## Global Constraints

- 主入口固定为「词库｜复习｜AI 练习」。
- 笔记、书签与保存的 AI 对话在次级“阅读记录”入口保留。
- 未翻面不允许评分。屏幕、辅助技术与接口正面数据均不泄露隐藏答案。
- 人工字段独立于 AI 建议。旧 AI 任务不得覆盖新修改。
- 旧 reviewCount 不是完整历史；不伪造 FSRS 历史、稳定性或个人优化结果。
- 新表与字段增量添加；上线前不删除旧字段，留出回滚窗口。
- 全部查询、编辑、练习选词和流式事件均校验 workspace 与 user 范围。
- 不把一次 Good 显示成“全面掌握”。
- 离线词典署名和许可仍可访问及随导出保留。

## Review Focus

1. 旧 note 为损坏JSON、纯文本或截断AI时，保存证据而非制造释义（Task1–2）。
2. 同workspace不同用户、删除文档或伪造source ID不泄露词库（Task2、5）。
3. 两个窗口／重复网络请求评分一次；幂等ID冲突不能重评别的卡（Task3）。
4. 答案在浏览器初始数据、aria-label和接口response中也被隐藏（Task4、6）。
5. 迁移中断再跑，已有人工修改和新FSRS记录不被覆盖（Task2、7）。

## File structure and shared types

新词汇模块放在 `src/server/vocabulary/`，排程放 `src/server/review/`；学习页面拆分在 `src/components/study/`。数据库辅助fixture `tests/helpers/vocabulary-db.ts` 定义并导出 `createVocabularyDB()`，统一创建临时SQLite，返回 `prisma,scope,document,seedWord,seedSense,close`，不触碰真实生产库。各测试 beforeEach 创建 db，afterEach close；第三份计划需要的 seedJob/task/response 也集中扩展该fixture。

```ts
export type LearningScope={userId:string;workspaceId:string};
export type SourceLanguage='en'|'es';
export type MeaningLanguage='en'|'zh';
export type ContextMeaning={en?:string;zh?:string};
export type SavedEvidence={rawNote:string;context:string;targetSentence:string;
 phonetic:string;sourceLanguage:SourceLanguage;meaning:ContextMeaning;legacyContextMeaning:string;
 dictionary:unknown;legacyReviewAt:Date|null;legacyReviewCount:number};
export type ReviewFront={sessionId:string;cardId:string;version:number;
 word:string;sentence:string;sourceLanguage:SourceLanguage;remaining:number};
export type ReviewBack={meaning:string;collocation:string|null};
```

### Task 1: 已知收藏数据的安全解析与紧凑展示模型

**Files:** Create `src/server/vocabulary/types.ts`、`src/lib/saved-word.ts`、`src/components/study/word-display.ts`；Test `tests/saved-word.test.ts`；保留 readable-note.ts 作为旧记录与导出功能。

**Interfaces:** Produce `parseSavedWord(note:string,text:string):SavedEvidence`（legacy review 字段默认 null/0，调用者从原entry补充）、`displayBookTitle(title:string):string`、`targetSentence(context:string,word:string,language:SourceLanguage):string`。只在词边界突出目标词，不把 car 匹配到 carpet；屈折词匹配由出处保存的surface负责。

- [ ] 写红测：

```ts
it('prioritizes context meaning and preserves bad JSON verbatim',()=>{
 const raw=JSON.stringify({sourceLanguage:'en',context:'I squint against the wind.',
  contextMeaning:{zh:'眯起眼睛看'},aiExplanation:'眯起眼睛看',meanings:[{partOfSpeech:'verb',definitions:[{definition:'斜视'}]}]});
 expect(parseSavedWord(raw,'squint').meaning.zh).toBe('眯起眼睛看');
 const broken=parseSavedWord('{bad','squint');
 expect(broken.rawNote).toBe('{bad');expect(broken.meaning).toEqual({});
 expect(displayBookTitle('Just Until (Joseph Moldover) (Z-Library).epub')).toBe('Just Until (Joseph Moldover)');
});
```

- [ ] Run `npm test -- tests/saved-word.test.ts`，确认红。
- [ ] 只读取已知的 string 或 `{answer:string}` AI字段；新contextMeaning.en/zh显式保留语言。旧AI字符串存legacyContextMeaning且优先显示，但不根据词典definitionLanguage猜AI回答语言，不用全文AI boilerplate正则制造义项。旧混合语言文本保留raw并提供legacy display，不错误宣称分类已完成。targetSentence 用 Intl.Segmenter 找包含surface的句子，无匹配保留有限原文预览。
- [ ] 增加 malicious HTML、word boundaries、Spanish accents、无context、整段多句、长filename、plain note测试；React仅文本渲染。
- [ ] Run 新test及study-format、formatted-text；commit `feat(study): parse contextual saved words without losing evidence`。

### Task 2: 增量 schema、幂等迁移与出处关联

**Files:** Modify `prisma/schema.prisma`、`src/server/reading/reading.service.ts`；Create `src/server/vocabulary/migration.ts`、`src/server/vocabulary/service.ts`、`scripts/migrate-vocabulary.ts`、`scripts/migrate-learning-schema.mjs`、`tests/helpers/vocabulary-db.ts`；Test `tests/vocabulary-migration.test.ts`、`tests/vocabulary-scope.test.ts`。

**Interfaces:** `migrateSavedWords(prisma,scope?:LearningScope):Promise<{read:number;linked:number;unresolved:number}>`；`vocabularyService.capture(scope,entry):Promise<{senseId:string;encounterId:string}>`。定义相互独立、可查询的表：

```text
VocabularySense: id,userId,workspaceId,sourceLanguage,lemma,senseKey,status,
 meaningEn,meaningZh,manualMeaningEn,manualMeaningZh,pos,semanticCategory,
 domain,encounterContext,tagsJson,manualTagsJson,collocationsJson,priority,revision,createdAt,updatedAt
 unique(userId,workspaceId,sourceLanguage,lemma,senseKey)
VocabularyEncounter: id,senseId,userId,workspaceId,readingEntryId UNIQUE,
 documentId,location,surface,targetSentence,context,rawNote,dictionaryJson,
 phonetic,createdAt,lastSeenAt
ReviewCard: id,senseId,ability='recognition',stateJson,due,version,createdAt
 unique(senseId,ability)
ReviewLog: id,cardId,userId,workspaceId,operationId,rating,reviewedAt,
 beforeJson,afterJson,logJson; unique(userId,workspaceId,operationId)
ReviewSession: id,userId,workspaceId,cardId,cardVersion,senseRevision,definitionLanguage,expiresAt,revealedAt
```

FK联接User、Workspace、Document及ReadingEntry；给原models增加Prisma反向relation；sense删除cascade卡片及session，日志保留有策略但不跨用户可见。senseKey未确定使用 `unresolved:` + entry.id，不用AI摘要hash合并。增量迁移SQL通过当前schema到新schema的diff生成并纳入版本。

- [ ] fixture复制当前schema初始化临时DB，seed旧 word/note/bookmark/chat和两种语言；migration运行两次计数不增加、rawNote逐字相同、旧due保留。

```ts
it('migrates twice without changing original evidence or existing manual fields',async()=>{
 const db=await createVocabularyDB();
 const old=await db.seedWord({text:'squint',note:'{broken',reviewAt:new Date('2026-10-01T00:00:00Z')});
 await migrateSavedWords(db.prisma);await migrateSavedWords(db.prisma);
 expect(await db.prisma.vocabularyEncounter.count({where:{readingEntryId:old.id}})).toBe(1);
 expect((await db.prisma.readingEntry.findUniqueOrThrow({where:{id:old.id}})).note).toBe('{broken');
 await db.close();
});
```

- [ ] Execute时先写test、运行确认缺schema／function失败，再增加schema，`XDG_CACHE_HOME=/private/tmp/deepreader-prisma-cache npx prisma generate` 和临时DB增量SQL；不能对现有production执行 db push。
- [ ] migration逐entry事务upsert：未知note保留、无义项不合并、用createEmptyCard产生stateJson，迁移旧due但不造log或reps；已存在encounter／card不覆盖。
- [ ] 新收藏capture与readingEntry保存同事务；原词立即可返回；重复entry不重建card。后台整理job在第三份计划接入，不用此阶段的进程内promise充当任务队列。
- [ ] schema migration runner只接受 `--database <绝对副本路径>`，拒绝隐式production env；记录 applied version 表与SQL校验和，事务应用，foreign_key_check／quick_check；重复应用跳过，有checksum变更拒绝。
- [ ] Run migration、scope、reading-data／reading-integration；commit `feat(vocabulary): migrate senses and encounters without altering legacy records`。

### Task 3: 官方 FSRS、完整状态、事务与幂等评分

**Files:** Create `src/server/review/scheduler.ts`、`src/server/review/service.ts`；Modify package.json、package-lock.json、reading.service.ts；Test `tests/fsrs-review.test.ts`、`tests/review-concurrency.test.ts`。

**Interfaces:** `newReviewCard(now:Date):Card`；`scheduleReview(card:Card,rating:'again'|'good',now:Date):{card:Card;log:ReviewLog}`（Card/ReviewLog从ts-fsrs导入）；`reviewService.rate(scope,{sessionId,operationId,rating}):Promise<{cardId:string;due:string;version:number}>`。

- [ ] 写官方行为对照测试：

```ts
import {createEmptyCard,fsrs,Rating} from 'ts-fsrs';
it('matches the official scheduler rather than a hardcoded day table',()=>{
 const now=new Date('2026-10-01T00:00:00Z'),card=createEmptyCard(now);
 const expected=fsrs({enable_fuzz:false}).next(card,now,Rating.Good);
 expect(scheduleReview(card,'good',now,{enable_fuzz:false})).toEqual(expected);
});
```

- [ ] 函数增加可选测试参数 `parameters?:Partial<FSRSParameters>`，production省略使用默认。先Run红，再用执行阶段命令 `npm --cache /private/tmp/deepreader-npm-cache install --save-exact ts-fsrs@5.4.2`。阅读安装包实际 `.d.ts`，stateJson保留所有字段包括learning steps，Date显式序列化／还原并validate。
- [ ] 实现最薄scheduler adapter：

```ts
return fsrs(parameters).next(card,now,rating==='again'?Rating.Again:Rating.Good);
```

- [ ] rate事务中验证scope、session未过期且revealed、cardVersion匹配；先找operationId幂等log，仅payload card/rating一致才返回旧结果，否则409。CAS updateMany `where:{id,version}`，count!=1冲突；写完整before/after/log和唯一operationId；失败rollback。
- [ ] 用两个不同operationId并发同session，恰好一条log／一版state；同operation重试返回同due，不能再次评分。旧 `/api/study PATCH` 转为明确409“使用新复习会话”，不保留绕过翻面的评分入口；更新旧测试与UI请求同步。
- [ ] Run scheduler、concurrency、reading-data（保留隔离测试）、完整suite；commit `feat(review): schedule with FSRS and atomically record ratings`。

### Task 4: 服务端隐藏答案的复习会话 API

**Files:** Create `src/app/api/study/review/route.ts`、`src/app/api/study/review/reveal/route.ts`、`src/app/api/study/review/rate/route.ts`；Modify review/service.ts；Test `tests/review-route.test.ts`。

**Interfaces:** GET review返回ReviewFront；POST reveal `{sessionId}`返回ReviewBack；POST rate `{sessionId,operationId,rating}`返回Task3结果。session期限30分钟，绑定用户与card.version；回答之后session不能第二次评分。服务器now权威，不接受浏览器传入due／评分时间。

- [ ] 写正面不泄露用例及401/跨用户用例：

```ts
it('front response contains no answer or dictionary fields',async()=>{
 const response=await reviewService.front(scope,'zh');
 expect(Object.keys(response).sort()).toEqual(['cardId','remaining','sentence','sessionId','sourceLanguage','version','word'].sort());
 expect(JSON.stringify(response)).not.toContain('眯起眼睛');
 await expect(reviewService.rate(scope,{sessionId:response.sessionId,operationId:'op-1',rating:'good'})).rejects.toMatchObject({status:409});
});
```

- [ ] 定义 `front(scope,definitionLanguage:MeaningLanguage,sourceLanguage?:SourceLanguage):Promise<ReviewFront|null>`、`reveal(scope,sessionId):Promise<ReviewBack>`；测试用例先断言 response 非 null 再使用。session记录请求的definitionLanguage与senseRevision，详情编辑导致revision改变时旧session返回409，不把改后的答案用于旧正面。Run红。
- [ ] 按due排序新／到期recognition卡，已删除文档的出处过滤并选择另一个可用出处；无due卡返回null和nextDue summary。front仅select所需字段，不通过完整Word DTO再在客户端删除answer。
- [ ] reveal提交时间持久化；不在前端state或SSR preload提前装载back。request严格Zod、私有no-store、限流、防跨站写操作遵循现有auth/http模式；route不打印rawAnswer。
- [ ] 增加session过期、文档删除、同workspace另一user、revision更改后旧session、答案languagefallback明确标记测试。Run review-route／auth-guard；commit `feat(review): reveal contextual answers only after flipping`。

### Task 5: 紧凑词库 API、详情／编辑／导出

**Files:** Create `src/app/api/study/vocabulary/route.ts`、`src/app/api/study/vocabulary/[id]/route.ts`、`src/server/vocabulary/query.ts`；Modify vocabulary/service.ts及study/export.ts；Test `tests/vocabulary-query.test.ts`、`tests/vocabulary-edit.test.ts`。

**Interfaces:** list `{q,sourceLanguage,definitionLanguage,pos,domain,state,cursor,limit<=100}` 返回 `{items,nextCursor,dueCount}`。WordSummary={id,word,phonetic,contextMeaning,sentence,bookTitle,sourceLanguage,tags,recognitionState,usageState,due}；详情包含sources、collocations及dictionary元数据；PATCH `{revision,manualMeaning,manualTags,priority}`。列表绝不返回rawNote及全文词典。

- [ ] 写compactDTO及optimistic edit测试：

```ts
it('does not overwrite manual meaning with a subsequent generated update',async()=>{
 const sense=await db.seedSense({meaningZh:'斜视'});
 await vocabularyService.edit(scope,sense.id,{revision:0,manualMeaning:{zh:'眯起眼睛看'}});
 await expect(vocabularyService.applySuggestion(scope,sense.id,0,{meaningZh:'斜视'})).rejects.toMatchObject({status:409});
 expect((await vocabularyService.detail(scope,sense.id,'zh')).contextMeaning).toBe('眯起眼睛看');
});
```

- [ ] 明确定义 applySuggestion供下一计划consumes，只有jobscope允许调用，无public不受验证直接update；Run红。
- [ ] 构造最少select，搜索同时覆盖lemma／有效释义／目标句／书名；组合filter AND，分页稳定(createdAt,id)。recognition显示新／学习中／待复习；usage无evidence“尚未练习”。详情最多两条有效collocations，无数据不编造。
- [ ] 导出context优先但带完整原始出处、人工／AI来源区别、词典署名许可；CSV继续csvCell防公式注入；删除sense确认，事务处理encounters及旧word entries，note/bookmark/chat不受影响。
- [ ] Run query/edit/study-format；commit `feat(vocabulary): expose compact contextual library and protected edits`。

### Task 6: 词库／详情／单卡复习页面与阅读记录保留

**Files:** Modify study-library.tsx；Create `study-navigation.tsx`、`vocabulary-list.tsx`、`vocabulary-detail.tsx`、`review-workspace.tsx`、`reading-records.tsx`；Test `tests/study-workbench.test.ts`、`tests/review-interaction.test.ts`；browser QA沿用阶段一runtime。

**Interfaces:** StudyLibrary编排三个主tab+次级阅读记录；AI练习tab在本阶段显示明确“下一阶段接入”，最终必须第三份计划替换成可用功能，不能当作完整目标。

- [ ] 写renderToStaticMarkup语义测试（非交互）验证精简字段，实际交互由浏览器覆盖：

```ts
it('keeps details folded and answers absent on the review front',()=>{
 const html=renderToStaticMarkup(createElement(ReviewCardFront,{front, onReveal:()=>{}}));
 expect(html).toContain('显示答案');expect(html).not.toContain('眯起眼睛');
 expect(html).not.toContain('想起来了');
});
```

- [ ] 同任务新增ReviewCardFront为review-workspace.tsx的namedexport，fixture front严格取ReviewFront；Run红。
- [ ] 采用现有卡片／字体／theme tokens与轻层级，不添加花哨动画；词头最大、本句义第二、句子单行/两行截断、最多两tags；移动端按钮仍可操作。详情accordions保留keyboard、署名与返回原文。
- [ ] 复习loading→front→revealed→rating→next，rating前按钮禁用与服务器guard双层；失败留当前卡，同一操作重试同operationId，开始新评分才生成新UUID。朗读复用现有language-tools，不引入第三方服务。
- [ ] 浏览器：收藏旧／新词→词库→详情→返回原文→复习答前DOM/response检查→翻面→Good→due变化→Again；键盘全部动作、日夜和窄屏；原笔记／书签／chat次级入口可读导出。
- [ ] Run新旧study tests+fullsuite+tsc+build；commit `feat(study): launch compact vocabulary and focused contextual review`。

### Task 7: 副本迁移演练、回归与阶段发布

**Files:** Create `scripts/qa/vocabulary-migration.ts`；Record `docs/qa/2026-10-01-vocabulary-review.md`；Update `docs/DEPLOYMENT.md`（若现有部署文档名称不同，先找并链接，不另造相互冲突指南）。

- [ ] 用本地fixture数据库包含重复surface/不同language/不同义项、未知note、旧reviewCount、人工字段、文档删除；脚本snapshot每个ReadingEntry的id/note/location/createdAt和新encounter relation。

```ts
const before=await prisma.readingEntry.findMany({orderBy:{id:'asc'}});
await migrateSavedWords(prisma);await migrateSavedWords(prisma);
const after=await prisma.readingEntry.findMany({orderBy:{id:'asc'}});
assert.deepStrictEqual(after,before);
```

- [ ] 运行迁移后评分一次再跑migration，assertcard/log不被重置；复制数据库，simulate迁移中断后重跑；foreign_key_check/quick_check为干净。
- [ ] fresh fullsuite/tsc/build/diff，独立review；将每条验收证据映射spec §6–7，不以snapshot相同代替新复习功能正确。
- [ ] 按第三份计划Task6的发布runbook处理schema版本和新dependencies；先server备份副本迁移并验证，再停本app做真实迁移。旧.env/keys/storage不变。浏览器实际线上复习并确认due及日志，记录无秘密结果。
- [ ] Commit测试与文档 `test(study): verify migration review and retained reading records`；完整目标仍待第三份计划。

## Plan review

用户审阅三份计划并选择执行方式后实施。所有新API名字／字段与这份共享类型一致；不引入只适配mock的排程或藏在CSS里的答案。`ts-fsrs`参考为官方包文档 https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/README.md 。
