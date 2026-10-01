# 阅读覆盖与真实流式 AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复默认主题、夜间意群可读性和漏段，并让全部现有用户可见 AI 生成真实流式呈现。

**Architecture:** 不改源书籍 DOM；将原段落映射成有界的文本单元，由公平队列调度，校验后逐单元绘制。统一 NDJSON transport 和现有 provider.stream，保留来源验证与取消链路。

**Tech Stack:** Next.js 16.2.3、React 19、Zustand、TypeScript、CSS Custom Highlight、Vitest；本阶段不新增业务依赖。

**Spec:** `docs/superpowers/specs/2026-10-01-reader-learning-workbench-design.md`，已由用户批准。后续计划为 `2026-10-01-vocabulary-review.md` 和 `2026-10-01-learning-practice.md`。

## Global Constraints

- 继续支持英语／西语，以及英英、英中、西英、西中学习语言组合。
- 扫描 PDF 不在范围内；可提取文字的 PDF 和 EPUB 在范围内。
- 现有笔记、书签、对话、离线词典、浮窗与返回原文功能保留。
- 不包裹／替换原文节点，不改变 EPUB CFI、PDF 字符坐标、翻页、选词或浮窗定位。
- 普通文字目标至少 4.5:1。三种底色均测，不仅测容器背景。
- 未校验结果不得缓存。用户已保存的合法主题选择保留。
- 错误日志不包含 API key、原始认证内容或完整用户书籍片段。
- 上线仅更新 `app.coacheverything.tech` 的 DeepReader 项目及其数据库。

## Review Focus

1. localStorage 损坏／拒绝写入时仍可阅读；主题不恢复成系统深色（Task 1）。
2. 父级直接文本、内联脚注和跨页元素既不丢失也不重复（Task 3、8）。
3. 单句超长、无空格 token、代理对与重音不被截断；超限明确状态（Task 2）。
4. 慢速流、UTF-8 字节断裂、断连与已显示内容后的重试不混入上一请求（Task 5、7）。
5. 429 不误报完成，关闭开关取消退避，恢复不突发耗尽额度（Task 4、8）。

## Working directory and evidence

执行时先读取仓库 AGENTS.md 和相关 `node_modules/next/dist/docs/`；使用 using-git-worktrees 建立隔离 checkout，保存文档提交并保持主 checkout 干净。当前代码基线 `dad878e`，当前文档提交以 git log 为准。

命令从隔离 checkout 根目录执行，写缓存仅使用 `/private/tmp` 或 checkout。每个 Task 的失败测试、成功测试与提交记录写入 `docs/qa/2026-10-01-reader-streaming.md`。实施全部 Task 后才进行阶段验收。

### Task 1: 统一日间默认，保留合法用户偏好

**Files:** Modify `src/lib/ui-preferences.ts`、`src/hooks/use-ui-preferences.ts`、`src/hooks/use-reader-store.ts`、`src/components/layout/theme-provider.tsx`、`src/app/layout.tsx`；Create `src/lib/reader-theme.ts`；Test `tests/ui-preferences.test.ts`、`tests/reader-theme.test.ts`。

**Interfaces:** Produce `resolveReaderTheme(raw: unknown): 'light'|'dark'|'sepia'`；UIPreferences 新增 `themeExplicit: boolean`；sourceLanguage、panel sizes、字体与意群 flag 不变。

- [ ] 写失败用例并更新旧“非法主题回到 system”的预期，合法 system 仍保留：

```ts
import {expect,it} from 'vitest';
import {readUIPreferences} from '@/lib/ui-preferences';
import {resolveReaderTheme} from '@/lib/reader-theme';
it('defaults to light without overwriting saved dark or sepia',()=>{
 expect(readUIPreferences(null).theme).toBe('light');
 expect(readUIPreferences({theme:'dark'}).theme).toBe('dark');
 expect(readUIPreferences({theme:'system'}).theme).toBe('system');
 expect(resolveReaderTheme({theme:'sepia'})).toBe('sepia');
 expect(resolveReaderTheme({theme:'invalid'})).toBe('light');
});
```

- [ ] Run `npm test -- tests/ui-preferences.test.ts tests/reader-theme.test.ts`；确认是新行为失败，不是导入环境故障。
- [ ] 将 theme 解析独立为纯函数；reader persist merge 对非法 theme 调用解析，不覆盖其他状态。setter 写 themeExplicit=true。UI preference 迁移保留合法 system/dark/light；无合法值写 light。

```ts
export function resolveReaderTheme(raw:unknown){
 const value=raw&&typeof raw==='object'?(raw as {theme?:unknown}).theme:null;
 return value==='dark'||value==='sepia'?value:'light';
}
// 首屏脚本只在明确 dark 或明确 system+系统深色时启用 dark。
const dark=p.theme==='dark'||(p.theme==='system'&&media.matches);
```

- [ ] 同步首屏脚本与 provider 规则；设置入口切换日／夜同步阅读偏好，纸色不意外转换全站主题。增加存储抛错、损坏 JSON、旧尺寸保留测试。
- [ ] 运行上述测试及 `npm test -- tests/native-ui-shell.test.ts`；浏览器新 profile+系统深色确认初屏日间，旧 dark 重载仍 dark。
- [ ] 仅 stage 此任务文件，commit `fix(theme): default to daylight and preserve user choices`。

### Task 2: 长段落分割为逐字覆盖的有界文本单元

**Files:** Create `src/lib/meaning-group-units.ts`；Modify `src/lib/meaning-groups.ts`；Test `tests/meaning-group-units.test.ts`。

**Interfaces:** Consume normalizeMeaningText、MeaningGroupResult。Produce `MeaningTextUnit={text:string;start:number;end:number}`、`splitMeaningText(text:string,max=1200,language:'en'|'es'='en'):MeaningTextUnit[]`、`offsetMeaningResult(result:MeaningGroupResult,offset:number):MappedMeaningSpans`。段落 canonical 文本是映射权威；unit.text 等于原文 slice；无空格且超 max 的完整 token 返回专门 oversize 错误，不丢掉它。

- [ ] 写覆盖测试：

```ts
import {expect,it} from 'vitest';
import {splitMeaningText} from '@/lib/meaning-group-units';
it('covers every nonspace character of a long Spanish paragraph',()=>{
 const text=('Ella no había podido verlo. Él llegó después. ').repeat(150).trim();
 const units=splitMeaningText(text,1200,'es');
 expect(units.length).toBeGreaterThan(1);
 expect(units.map(u=>u.text).join('').replace(/\s/g,''))
  .toBe(text.replace(/\s/g,''));
 for(const u of units){expect(u.text).toBe(text.slice(u.start,u.end));expect(u.text.length).toBeLessThanOrEqual(1200);}
});
```

- [ ] Run `npm test -- tests/meaning-group-units.test.ts`，记录失败。
- [ ] 用 Intl.Segmenter 句边界候选，空格边界作为超长句 fallback；不规范化两次导致偏移改变。不在字母／数字／组合音标／撇号／连字符内部断开。

```ts
const sentenceEnds=[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text)]
 .map(s=>s.index+s.segment.length);
// 每轮在 start+max 以内选最后的句界；若没有则找合法空白界。
// unit start/end 指向 canonical 原文；过滤边界空白，但保存其位置。
```

- [ ] 加入英语缩写、无标点长句、emoji、组合重音、连字符短语、4001+字符、无空白超限 token 测试。offset 函数同时平移 groups 和 verbs，保持 text 对齐策略清楚。
- [ ] 运行 `npm test -- tests/meaning-group-units.test.ts tests/meaning-groups.test.ts`；commit `fix(reader): split long passages without losing coverage`。

### Task 3: 独立阅读文本枚举与原 DOM Range 映射

**Files:** Create `src/components/reader/meaning-text-source.ts`；Modify `meaning-group-highlights.ts`、`src/hooks/use-meaning-group-reading.ts`；Test `tests/meaning-text-source.test.ts`、`tests/meaning-group-paragraphs.test.ts`。

**Interfaces:** Produce `MeaningTextSource={element:HTMLElement;text:string;points:Array<{node:Text;offset:number}>;ends:Array<{node:Text;offset:number}>}`、`collectMeaningSources(root:Element):MeaningTextSource[]`、`sourceRange(source:MeaningTextSource,start:number,end:number):Range`。paint 接受已创建的 group／verb Range，而不是要求整元素 textContent 恰好等于一个单元。

- [ ] 使用执行阶段增加的浏览器 QA fixture（Task 8）实测混合父容器；单元层给 DOM adapter 注入 Text 节点 fixture，断言该 HTML 中每个非空白文本字符只归属一次：

```html
<blockquote data-reader-interactive="true">Outside <em>direct</em> text.
 <p data-reader-interactive="true">Inside paragraph.</p>Tail.</blockquote>
<div class="book-prose">A div-only passage.</div>
<button>Reader control must not be sent.</button>
```

- [ ] Run `npm test -- tests/meaning-text-source.test.ts tests/meaning-group-paragraphs.test.ts`；现有 leaf-only 测试改为字符不重叠而非父容器直接排除。
- [ ] 枚举 Text 节点，为每个选择最近正文 block owner；skip script/style/nav/button/input/隐藏节点。父级直接文本在子正文边界分成单独 source，div-only 正文由块级语义及阅读容器判定纳入。为 `<br>` 分隔保留 canonical 空白，脚注控件不进入源文本。

```ts
const blocked='script,style,nav,button,input,textarea,select,[aria-hidden="true"]';
// TreeWalker FILTER_REJECT 被 blocked 祖先包围的节点；正文 Text 按 owner 聚合。
// 为 canonical 每个 UTF-16 字符记录 starts/ends；Range 只引用现有 Text。
```

- [ ] 把 unit 的 start/end 对应 sourceRange；源节点换身份即重建 Range，成功结果缓存仍按文本复用。visibility 使用 Range rects，而非跨页元素大 bounding box；所有 iframe 偏移与 PDF scroll clip 继续验证。
- [ ] 运行 source、paragraphs、units 测试；commit `fix(reader): cover mixed and unmarked book text without DOM mutation`。

### Task 4: 公平队列、诚实状态与有限限流恢复

**Files:** Modify `meaning-group-queue.ts`、`use-meaning-group-reading.ts`、`meaning-group-control.tsx`、`src/server/reading-assistant/meaning-groups.ts`、`src/app/api/meaning-groups/route.ts`；Test queue、route、service 原有文件。

**Interfaces:** setVisible 保留全部可视 unit text，至多两路请求；status 增加 `deferred:number` 与 `retryAt:number|null`，pending 不漏算。MeaningGroupLimitError 含 retryAfterSeconds；HTTP 429 返回 Retry-After。request error 支持 status、retryAfterMs。

- [ ] 写最关键红测及 fake timer 退避用例：

```ts
it('processes all 35 visible units and never reports premature completion',async()=>{
 const texts=Array.from({length:35},(_,i)=>`Visible paragraph ${i+1}.`);
 const queue=createMeaningGroupQueue(async text=>({text,groups:[{text,start:0,end:text.length}],verbs:[]}),()=>{});
 queue.setVisible(texts);
 for(let i=0;i<40;i++)await Promise.resolve();
 expect(texts.filter(t=>queue.get(t))).toHaveLength(35);
 expect(queue.status().pending).toBe(0);queue.dispose();
});
```

- [ ] Run `npm test -- tests/meaning-group-queue.test.ts`；35 项测试在旧实现须失败。
- [ ] 删除两个 slice(0,32)，按 insertion order 公平推进；对已成功项目不再占请求slot。429 自动恢复最多三轮／当前可视集合，Retry-After 限制在 1–120 秒；没有 header 使用 5、15、45 秒。401/403/503 不自动循环；非限流错误按单元显示重试。
- [ ] 关闭／dispose 取消 timer 和请求；重试按钮复位预算；队列不得把 canceled flight 当失败或 late cache success。服务端限流返回真实窗口剩余时间，不扩大额度。
- [ ] Run queue、route、service 测试；commit `fix(reader): fairly schedule all units and recover from rate limits`。

### Task 5: NDJSON transport 与可靠结构化文本增量

**Files:** Create `src/lib/ai-stream.ts`、`src/lib/partial-json-string.ts`、`src/server/ai/stream-response.ts`；Modify `explanation-stream.ts`、`src/types/ai.ts`；Test `tests/ai-stream.test.ts`、`tests/partial-json-string.test.ts`。

**Interfaces:** Define `AIStreamEvent<T>={requestId:string}&({type:'start';cached:boolean}|{type:'delta';text:string}|{type:'unit';index:number;value:T}|{type:'heartbeat'}|{type:'complete';value:T}|{type:'error';code:string;message:string})`。Produce `consumeAIStream<T>(response:Response,signal:AbortSignal,onEvent:(event:AIStreamEvent<T>)=>void):Promise<T>`、`aiStreamResponse<T>(signal:AbortSignal,generate:(signal:AbortSignal)=>AsyncIterable<AIStreamEvent<T>>):Response`、`readPartialString(buffer:string,key:string):string`。

- [ ] 写 UTF-8 和引号断裂测试，不用 split('answer') 误匹配 JSON 值：

```ts
it('decodes only a top-level answer and complete escaped characters',()=>{
 expect(readPartialString('{"answer":"ni\\u00','answer')).toBe('ni');
 expect(readPartialString('{"answer":"ni\\u00f1o','answer')).toBe('niño');
 expect(readPartialString('{"meta":"answer","answer":"A \\"quote','answer')).toBe('A "quote');
});
```

- [ ] Run `npm test -- tests/ai-stream.test.ts tests/partial-json-string.test.ts`，确认失败。
- [ ] 实现按 JSON lexical state 扫描 top-level key/string 的增量解码，未完整 escape/代理对延迟显示。NDJSON UTF8 decoder 保留跨chunk状态，最后一行也处理；事件大小上限1MB、总结果128KB，缺complete拒绝，不返回草稿作为成功。
- [ ] response 设置 private,no-store,no-transform、X-Accel-Buffering:no、NDJSON 类型；每15秒 heartbeat，finally 清理timer；disconnect/cancel向上游传播。错误只用业务脱敏白名单，不回传 provider 原始消息。已有 explanation 事件使用显式 adapter，保持其分节 UI。
- [ ] 测试慢源首个 delta 在 complete 前可读、主动 cancel、源 throw、error 后资源清理、requestId交叉和两个请求独立取消。运行测试并 commit `feat(ai): unify cancellable true streaming transport`。

### Task 6: 查词／阅读问答与意群服务真正调用 stream

**Files:** Modify `src/server/reading-assistant/service.ts`、`meaning-groups.ts`、两个 API route；Create `src/server/reading-assistant/stream-service.ts`；Test `tests/reading-assistant-stream.test.ts`、`tests/meaning-group-stream.test.ts`。

**Interfaces:** Produce `streamReadingAnswer(scope,input,config,signal):AsyncIterable<AIStreamEvent<ReadingAnswer>>`、`streamMeaningGroups(scope,input,config,signal):AsyncIterable<AIStreamEvent<MeaningGroupResult>>`，scope 与 existing input 保持同类型。非流式兼容只保留旧显式请求，不用于新 UI；所有可见功能走 stream。Provider.stream 缺失时返回 STREAM_UNSUPPORTED，不调用 complete 模拟增量。

- [ ] 写 provider mock generator 门闩测试：

```ts
it('emits answer before the provider finishes and validates final quotes',async()=>{
 let release!:()=>void;
 const held=new Promise<void>(r=>release=r);
 const provider={complete:vi.fn(),stream:async function*(){yield {content:'{"answer":"Meaning'};await held;yield {content:' here","citations":[]}'};}};
 // 用 input 文档fixture与 resolved config fixture；迭代至 delta后断言 complete从未调用。
 const events=streamReadingAnswer(scope,input,{...config,provider},new AbortController().signal)[Symbol.asyncIterator]();
 expect((await events.next()).value.type).toBe('start');
 expect((await events.next()).value).toMatchObject({type:'delta',text:'Meaning'});
 release();
});
```

- [ ] 同一测试文件显式定义 scope={workspaceId:'w',userId:'u'}、input={documentId:'d',mode:'word',text:'An occasion.',sourceLanguage:'en',level:'intermediate',language:'English'} 及 config fixture（providerKey/model/maxTokens/settingsHash/promptVersion/cacheEnabled/saveRaw*）。Run 两个新 stream 测试，确认红。
- [ ] 使用 provider.stream 循环累计结果，partial string 只发新增文本；最后调用 parseGroundedAnswer。summary scope提示只显示一次；quiz答案不通过 delta泄露到答前页面。缓存只在成功后写，缓存事件直接complete。
- [ ] 意群单位控制在 Task2的1200字目标以便及时验证；提取完整 group 对象时先校验 contiguous prefix和verbs，再发unit。最终 alignMeaningGroups 验证全覆盖；前缀如果失败清除本单元高亮并标error，不缓存。unit 的 offset 必须是原文 UTF16，不根据输出拼接猜测。
- [ ] 路由在开始 stream 前做auth/workspace/doc ownership/config校验；body size仍有界；途中过期权限错误脱敏。服务保留限流与完成缓存，独立请求取消不误伤其他订阅者。
- [ ] 测试引用错误、截断 JSON、provider中途throw、cachehit、缺stream、401/403与取消；Run reading-assistant、meaning相关测试后 commit `feat(ai): stream reading answers and validated sense units`。

### Task 7: 所有阅读客户端实时显示、取消及收藏草稿隔离

**Files:** Modify `word-lookup-content.tsx`、`reading-tools.tsx`、`explanation-panel.tsx`、`lookup-session.ts`、`use-meaning-group-reading.ts`；Create `src/hooks/use-reading-answer-stream.ts`；Test `tests/lookup-stream.test.ts`、`tests/reading-stream-session.test.ts`。

**Interfaces:** hook返回 `{draft:string;answer:ReadingAnswer|null;busy:boolean;error:string;start(input):Promise<void>;stop():void}`。answer只在complete后可收藏；原词/原句仍可立即保存并触发后续整理。dictionary继续并行 JSON 请求，不等待AI。

- [ ] 写 session测试：旧词A慢流→切B→A迟到，B页面不显示A；关窗abort；进一步理解在busy时仍显示已收到draft。

```ts
it('does not save an unvalidated draft as contextual meaning',()=>{
 const state={draft:'Possible meaning',answer:null,busy:true};
 expect(savedLookupPayload({word:'occasion',context:'An occasion.',sourceLanguage:'en'},state).aiExplanation).toBeUndefined();
});
```

- [ ] 同任务新增 `savedLookupPayload` 于 lookup-session.ts，测试其 source/word字段保留与complete字段写入；Run新tests红。
- [ ] 将所有 readingRequest('/api/reading-assistant') 调用替换stream hook/helper；保持非AI readingRequest JSON接口。移除等busy结束才渲染 extra的分支；草稿可见但标生成中，错误时不标完成。
- [ ] explanation panel复用transport decoder但不重写大型分节解析；unit消费加入meaninghook，增量paint仅当前DOMidentity有效。选择/语言变化请求ID更新，拒绝迟到事件。
- [ ] 列出路由／按钮矩阵：查词、进一步理解四项、quick/explain/translate/ask/summary/quiz、paragraph explain、explain-text、meaning-groups。每行标记请求stream方式和完成验证；搜索 remaining `.complete(`，区分仅后台诊断和用户可见路径。
- [ ] Run lookup、reading-assistant、Spanish parity测试；commit `feat(reader): render every AI action incrementally`。

### Task 8: 夜间颜色、浏览器端覆盖及真实模型验收

**Files:** Create `src/lib/meaning-theme.ts`、`tests/meaning-theme.test.ts`、`scripts/qa/reader-streaming.mjs`；Modify `meaning-group-highlights.ts`、meaning-group-control.tsx；Record `docs/qa/2026-10-01-reader-streaming.md`。

**Interfaces:** Produce `meaningPalette(theme,lowSaturation=false):{backgrounds:string[];foreground:string;verb:string}`，UI增加低彩度选项并持久化。测试用contrast helper独立计算sRGB合成。

- [ ] 写颜色测试，合成实际reader dark背景 `#171717`：

```ts
it('keeps body and verb readable on every dark group background',()=>{
 const p=meaningPalette('dark');
 for(const bg of p.backgrounds){
  expect(contrast(p.foreground,blend(bg,'#171717'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(p.verb,blend(bg,'#171717'))).toBeGreaterThanOrEqual(4.5);
 }
});
```

- [ ] 测试文件定义 contrast/blend真实公式而非断言css字符串；Run红。候选深色底色从 `#34463f/#4d452d/#493840`、foreground `#f1f1ef`、verb `#ffe0a3` 开始，用实际计算结果调整。hover priority保持0，意群-10／verb-5。
- [ ] QA脚本使用fixture服务和独立浏览器profile，复用项目已有 Playwright skill/runtime；不操作用户其他Chrome tab。涵盖35+单元、长段、多种block、换章／同text换DOM、EPUB分页、PDFtext scroll、原文innerHTML与rect不变、hover/点击／浮窗位置、关窗取消；截图日夜和窄屏。
- [ ] 使用当前合法配置在本应用做少量真实英语／西语样本，逐字对齐与finite predicate人工核验。只记录结果摘要、时序与失败码，不输出密钥/书籍长片段；真实模型失败保留为未通过，不用mock代替。
- [ ] Run `npm test`、`npx tsc --noEmit`、`npm run build`、`git diff --check`；记录fresh结果。使用 requesting-code-review 做阶段独立review，修复后重跑。
- [ ] Commit `test(reader): verify night readability coverage and streaming flows`。本阶段发布按第三份计划的 Task6同一runbook，无schema迁移；完整目标仍待词库与练习。

## Handoff and completion

阶段验收依次映射spec §4–5及§11；剩余两个计划明确继续执行，不以第一阶段通过标记完整goal完成。正式实施需用户审阅本计划并选择执行方式；方案选择与计划批准分别记录。
