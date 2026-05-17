# AI 逐段拆解英文 — 交互体验优化设计

## 概述

优化阅读器（Reader）中 AI 逐段拆解英文的交互体验，涵盖 4 个方向：
1. 句子令牌 → 原文高亮联动
2. 面板内容重组
3. 流式加载骨架屏
4. 词汇点击 → 原文高亮

所有方向共享同一套底层高亮引擎（`onFocusTargetChange` + DOM Range），确保整体一致性。

## 1. 高亮联动引擎（方向①④）

### 现有基础设施（无需重建）

- `buildNormalizedTextMap` — 将 EPUB 段落 DOM 文本节点映射为字符偏移 → DOM Range 的查找表
- `getFocusRanges` — 根据偏移计算 Focus Range
- `getDimRanges` — 计算 Focus 的补集（其余文字变暗）
- `applyDomSentenceDim` — 渲染高亮和变暗效果
- `clearUnderlineAnnotations` — 清除所有标注
- `handleFocusTargetChange` — 已在 reader-layout 中实现
- `onFocusTargetChange` — prop 已传递到 explanation-panel 但从未调用

### 变更

**偏移映射（方向①④共用）：**
AI 返回的 `SentenceBreakdown` 包含 `subject_core`、`verb_core`、`object_core` 等字段，`VocabularyNote` 包含 `term` 字段。这些字段不包含字符偏移，需要通过文本搜索定位：
```
function findOffsetsInParagraph(
  paragraphText: string,    // 已过滤 \xAD soft hyphen
  searchText: string        // AI 返回的字段文本
): { start: number; end: number } | null
  // 返回段落内首个匹配位置的字符偏移
  // 单句内通常唯一，无需消歧
```

**SentenceAccordionList 令牌点击（方向①）：**
- `OrderedStructureLine` 渲染的每个令牌 `<span>` 绑定 `onClick`
- 点击构建 `FocusTarget { type: 'sentence', paragraphIndex, sentenceIndex, offsets }`
- 调用 `onFocusTargetChange(target)` → reader-layout 执行高亮
- 令牌高亮 = **独占模式**：新点击替换当前高亮，再次点击已高亮令牌取消

**词汇标签页点击高亮（方向④）：**
- `VocabularyNote` 卡片标题变为可点击 chip 按钮（选中态：橙色边框）
- 词汇高亮 = **累加模式**：多个词汇可同时高亮，与令牌高亮互斥
- 令牌高亮时点击词汇 → 令牌高亮清除，词汇高亮生效
- 词汇高亮时点击令牌 → 词汇高亮清除，令牌高亮生效
- 再次点击已选中词汇取消高亮
- 词汇定位：`term` 在 `paragraphText`（段落原文）中搜索匹配

### 高亮样式

- Focus（高亮部分）：`rgba(249, 115, 22, 0.25)` 背景 + 2px orange 下边框 + 2px 圆角
- Dim（其余部分）：`opacity: 0.3` + 0.2s transition

## 2. 面板内容重组

### 当前问题

- Meaning 标签页承载了段落大意、逐句拆解（令牌）、Who-Did-What、语气/潜台词、阅读提示 5 种信息，滚动过长
- 句子令牌分散在 Meaning 的 SentenceBreakdown 区域，信息密度高
- Who-Did-What 和 SentenceBreakdown 内容重叠（都说同一件事）
- Grammar（语法）和 Logic（逻辑）独立标签页但使用率低
- Translation（翻译）独占一个标签页

### 重组方案

从 5 标签页精简为 3 标签页：

| 标签页 | 包含内容 | 说明 |
|--------|---------|------|
| **理解** | 段落大意 + 逐句意译 + 阅读提示 | 先总后分，自上而下 |
| **分析** | 令牌拆解 + 从句图谱 + 指代 + 语法 + 逻辑 | 所有语言分析集中 |
| **词汇** | 词汇列表（点击高亮原文） + 译文脚注 | 译文收起为可展开脚注 |

**"理解"标签页内部结构：**
- 段落大意（一句话摘要）
- 逐句意译列表（每条带 "查看拆解 ▶" 按钮，原位展开令牌 Accordion）
- 阅读提示（浅色背景区块）

**"分析"标签页内部结构：**
- 句子令牌（彩色标注，点击高亮原文）
- 从句图谱（ClauseMap 可视化）
- 语法点（GrammarNotes）
- 逻辑流（LogicFlow）— 折叠子区

**"词汇"标签页内部结构：**
- 词汇 chip 列表（点击高亮/取消高亮原文）
- 选中词汇展开详情卡片（释义 + 用法）
- 译文脚注（可折叠）

## 3. 流式加载骨架屏

### 状态模型

每个区块三态：`skeleton → streaming → complete`

- **skeleton** — 区块显示灰条 shimmer 占位
- **streaming** — 内容流式追加，末尾闪烁光标指示器
- **complete** — fadeInUp 渐入动画，固定内容

### 区块分解

| 区块 ID | 所属标签页 | 骨架形态 |
|---------|-----------|---------|
| summary | 理解 | 2 行灰条 |
| meaning | 理解 | 逐句灰条 |
| breakdown | 分析 | 令牌骨架 |
| vocabulary | 词汇 | 圆角 chip 骨架 |
| grammar | 分析 | 语法块骨架 |
| logic | 分析 | 步骤骨架 |
| translation | 词汇（脚注） | 单行灰条 |

### 状态转换逻辑

```typescript
type SectionState = 'skeleton' | 'streaming' | 'complete';
const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({...});

// NDJSON 流式 chunk 解析 parsePartialExplanationOutput
// 当 chunk 中首次出现某字段 → 对应区块 skeleton → streaming
// 当流式结束 → 所有区块 streaming → complete
```

### 样式

- 骨架：渐变 shimmer 动画（`background-size: 200%` + `translateX(-50%)` 循环）
- 流式：末尾闪烁竖线指示器（`border-color` 动画）
- 完成：`fadeInUp` 动画 0.3s ease-out

## 修改文件清单

| 文件 | 变更内容 |
|------|---------|
| `src/components/reader/explanation-panel.tsx` | 调用 onFocusTargetChange、令牌/vocabulary onClick、面板重组、骨架屏 |
| `src/components/reader/reader-layout.tsx` | handleFocusTargetChange 的偏移映射增强、多词汇高亮支持 |
| `src/types/explanation.ts` | 可能新增 FocusTarget 相关类型 |

## 不修改的文件

- AI providers — 无变更
- Zustand store — 无变更
- Sidebar / Layout — 无变更
- ReaderWrapper — 无变更

## 验证

1. 点击段落 → 面板打开，骨架屏可见
2. 流式内容到达 → 区块逐块渐入填充
3. 点击 "理解" 标签页的句子 → Accordion 展开令牌
4. 点击令牌 → EPUB 原文对应部分高亮，其余变暗
5. 切换到 "词汇" 标签页 → 点击词汇 chip → 原文高亮
6. 多词汇同时高亮正常
7. 再次点击已高亮项 → 取消高亮
8. 操作 "分析" 标签页的从句图谱和语法区域
