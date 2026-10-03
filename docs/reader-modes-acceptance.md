# 阅读模式验收记录

## 发布前范围与证据（2026-10-03）

本次实现：当前视口及前后两屏滚动意群队列、EPUB 原生纵向阅读、按语境单次单词翻牌。扫描 PDF 不在范围；PDF 文本阅读支持翻牌和意群。书籍源文件、数据库结构不改写，显示替换只在内存。

| 门槛 | 结果 | 证据边界 |
|---|---|---|
| 单元及集成回归 | 738/738，121 文件 | Vitest 全套、TypeScript exit 0；发布前重新构建 |
| 实际 ReaderLayout + EPUB.js | 已通过 | 隔离 Chromium，loopback 合成 EN/ES 三章，十屏翻页、原生滚轮和触摸、六种语言组合、PDF 文本 |
| 构造图 / Mapping / Contents / 旧 CFI | 已通过 | 真实 root/Contents 构造同一 EpubCFI，Mapping 两次、selection 一次；隔离 Next 生产 bundle toRange 增长 36，纵向重建保留翻牌 |
| 列宽增长与恢复 | 已通过 | 24 次 119 字符合成替换；最终 960px 视口实际宽度 20640→22790→20640，1280px 先前为 24190→25960→24190；旧 CFI 不变 |
| 长段落尾部 AI 和绘制 | 已通过 | 第三章 FINAL TAIL 实际入队，四种 CSS Highlight 绘制；三章连续目录导航按请求章 CFI 验证 |
| 真实模型语义质量 | 已通过，累计 12/12 调用 | 服务器现有 deepseek / deepseek-v4-flash；只十条合成样例及两次复测；人工义项与词形检查 |
| GitHub / 生产 | 本验收快照时未发布 | 最终 SHA 与健康结果以发布日志及交付记录为准 |

隔离 Next 验收只使用临时合成账号、SQLite 和合成书，不复制生产凭据/数据库。临时 QA callback 已从普通 reader wrapper 撤除；最终构建须重新生成，QA `.next` 不可部署。

## 可重复的浏览器验收

`node scripts/qa/reader-streaming.mjs --port 3018` 只监听 127.0.0.1，真实组件、合成书、mock API。用已安装 Playwright CLI 的 page 执行 `scripts/qa/reader-modes.browser.mjs` 导出的 `runReaderModesQA`、`runReaderGrowthQA`、`runReaderTailQA`、`runReaderFaultQA`、`runReaderUnsupportedQA`、`runReaderLifecycleQA`、`runReaderLegacyQA`、`runReaderFixtureIsolationQA`。CLI VM 不支持动态 import 时，把模块函数源码内联给 run-code；不安装生产 Playwright 依赖。

mock 的 active 统计计数提供商工作，不把已经完成的 HTTP 连接当作提供商仍忙；上限两任务。mock 故障接口仅 loopback：`/__qa_fault` 的 429、503、deferred、long。

## 真实模型独立门槛

`scripts/qa/semantic-flip-live.ts` 无显式参数默认仅校验十条合成样例，零提供商调用。实际验收只允许显式 `--live-synthetic --max-calls 12 --user-id <指定配置账号ID>`，总额包括格式修复。样例覆盖歧义、词形、重复词、引号内注入数据、英/西源与三个目标。

人工根据 `senseCriterion` 检查语境义项、时态/人称、简明程度和仅替换一词；不强制同一字符串。输出只有合成词及结果和提供商/模型名，不输出账号、密钥、私有书籍。若本地没有配置，允许将受审查的独立 bundle 放进服务器项目备份目录，在不更新线上 HEAD/build 的预检阶段运行；验收未通过就不发布。

## 真实模型结果与修复

首批十次：occasion→event、squint→narrow my eyes、银行 bank→银行、negociar→negotiate、公园 banco→长椅、contempló→miró、llegaron→arrived、重复 CAT 的第二处→猫、含引号内伪指令的河岸 bank→shore 均符合语境。英文 “will negotiate” 初次替换为西语 “negociarán”，会与保留的 will 重复表达时态，判定不通过。

增加“不可重复相邻助动词承担的时态／人称”约束，并将语义缓存 prompt version 升至 v2。剩余两次显式复测（`--used-calls 10 --indices 3,7`）得到 negotiate→negociar、llegaron→arrived，人工验收通过。总计十二次，不再追加模型调用。合成 bundle 只存入服务器 DeepReader 备份目录；该验收没有更新线上代码、环境文件或数据库。

## 浏览器回归发现的原生边界

连续 manager 的自身队列会销毁旧视图，显式格式化必须先排空其生命周期任务；check/update 分开入队，并同步真实滚动坐标。href 导航取请求章节的 canonical anchor，不等待可能属于相邻章节的中间 relocation。collapsed 原文锚点必须保持所属 Text，不能因两端偏向不同而被 Range 隐式挪到前一段末尾。

纵向锚点留一像素内边距，避免整数 scrollTop 裁掉目标行；silent 原生滚动无实际位移时恢复 ignore 原值，避免吞掉下一次用户滚轮事件。上述问题均先复现失败再加单元回归修复；分页列增长／缩小、实际滚轮／触摸和中段字体／窗口调整／pagehide／书签均需浏览器复核。

## 发布约束

预检线上旧 HEAD：`bef29163b4a865544027e16c9b32d8fb4ade1cc7`，网页与学习 worker 均 active，目录 `/opt/deepreader-app`。只允许受审查脚本 `scripts/deploy/deepreader-reader-release.sh`，非强制 GitHub main 快进、保留依赖／schema／env／上传、只停启 web、SQLite 一致快照和 code/build 回滚。不恢复旧快照覆盖运行中的数据。

当前文档记录发布前证据，不把尚未执行的线上更新写成完成。线上最终 SHA、备份路径及健康校验应由发布脚本日志与交付记录给出。Chrome 的 Allow JavaScript from Apple Events 使用完成后由用户关闭。

## Final browser evidence

2026-10-03: all six combined browser gates passed on the final source. Ten screens; six language pairs and PDF text; no legacy dictionary/explanation request increments while flipping; maxActive=2. Twenty-four long replacements grew columns and restored their original width. Chapter-three tail entered AI and painted all four CSS highlight groups. Fault/retry/cancel, unsupported layouts, mid-book typography/resize/pagehide/bookmarks/toolbar passed. Separately, legacy floating-panel scroll close, pinned source return and original-CFI note save/jump passed.

The real Next production bundle passed both constructor identities, Mapping=2 / Contents selection=1 before and after vertical reconstruction, toRange growth=36, and retention of one completed flip. Temporary QA wrapper injection was removed byte-for-byte before the separate final non-QA build. Latest unit/integration suite after review fixes: 744 tests / 123 files; TypeScript exit 0. Live-provider acceptance used exactly 12 cumulative calls, with no further calls allowed.


## 整分支审查修复（发布前）

一次独立审查发现两项 Important：图片封面／空目录锚点的定位、原生章节卸载后翻牌未重新绑定。均已先观察回归失败，再修复；无 Critical 或待延后 Minor。结构元素采用 EPUBjs 的节点 CFI，而不是追加不存在文本节点的 range CFI。新内容生命周期先恢复翻牌、校正视图尺寸，再恢复就绪与进度确认。

另以真实鼠标拖选得到 `CAT after`，其尾随点击曾将 `after` 提交给模拟接口；现在有非折叠选区时禁止指针翻牌，Alt+Enter 单独保留。修复后的真实拖选选区完整、请求增量 0。

新增真实浏览器门禁：图片封面、固定版式图片封面、空目录锚点均可进入就绪并跳转；分页前进 23 页、纵向前进 24 屏，实际卸载旧章节，原生返回 3 步至新建的第一章，翻牌仍保留，模型请求增量均为 0。两种模式使用独立合成文档身份，避免前一个测试的 pagehide 进度污染后一测试。
