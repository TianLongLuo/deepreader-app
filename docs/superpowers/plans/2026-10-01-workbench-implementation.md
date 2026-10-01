# DeepReader 完整改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成用户请求的日间默认、夜间意群可读性、完整意群覆盖、全部AI真实流式，以及简洁可复习、可练习的词汇学习工作台。

**Architecture:** 三个按依赖顺序执行的子计划，各自可测试、review和交付；阶段通过不缩减完整目标。阅读保留原文DOM与位置，词库采用增量无损迁移，识别排程与应用证据分别存储。

**Tech Stack:** Existing Next.js 16.2.3／React19／Prisma6／SQLite／Vitest；ts-fsrs5.4.2与app专属wordfreq3.1.1运行环境只在执行阶段加入。

**Spec:** `docs/superpowers/specs/2026-10-01-reader-learning-workbench-design.md`。用户于2026-10-01明确回复“设计确认”。用户随后回复“计划确认，由你连续实施”；Native 执行已开始。

## Global Constraints

- 扫描 PDF 不在范围内；可提取文字的 PDF 和 EPUB 在范围内。
- 继续支持英语／西语，以及英英、英中、西英、西中学习语言组合。
- 现有笔记、书签、对话、离线词典、浮窗与返回原文功能保留。
- 不包裹／替换原文节点，不改变 EPUB CFI、PDF 字符坐标、翻页、选词或浮窗定位。
- 人工修订版本为写入前置条件，旧 AI 任务不得覆盖新修改。
- 旧 reviewCount 不是完整历史；不伪造 FSRS 历史、稳定性或个人优化结果。
- 新表与字段增量添加；上线前不删除旧字段，留出回滚窗口。
- 上线仅更新 `app.coacheverything.tech` 的 DeepReader 项目及其数据库。
- 全部查询、编辑、练习选词和流式事件均校验 workspace 与 user 范围。

## Review Focus

1. 字符／DOM覆盖不等于真实模型语义正确；两者都必须验证（Plan1 Task2–3、8）。
2. 流式HTTP200不等于生成成功，缺complete／无效引用不能持久化成品（Plan1 Task5–7、Plan3 Task4–5）。
3. 旧数据迁移和并发评分不能覆盖人工修改或建立虚假历史（Plan2 Task2–5、7）。
4. 标签、频率、接触／认义／应用不是同一指标，来源与能力证据保持分离（Plan3 Task1–5）。
5. 生产回滚不能因恢复旧数据库抹掉新学习数据；不误伤服务器其他服务（Plan3 Task6）。

## Execution sequence

- [ ] 审阅 [阅读修复与流式输出](2026-10-01-reader-streaming.md)：8个Task。
- [ ] 审阅 [语境词库与FSRS复习](2026-10-01-vocabulary-review.md)：7个Task。
- [ ] 审阅 [自动整理与AI练习](2026-10-01-learning-practice.md)：6个Task。
- [x] 用户选择Native，已读取executing-plans/TDD并建立隔离worktree。
- [ ] 按Plan1 → Plan2 → Plan3顺序实施，保持各task红绿测试及review记录。
- [ ] 每个阶段按Plan3 Task6同一发布runbook验证；Plan1不涉及schema，Plan2/3只执行对应增量schema版本，不提前运行不存在的功能迁移。
- [ ] 发布到GitHub main和本应用服务器，形成fresh线上证据。
- [ ] 按spec §11和Plan3 requirement map逐条审计，缺项继续工作，全部证明才完成goal。

## Approval boundaries and execution options

计划批准涵盖列明的本应用新增表、app专属worker及词频venv；不涵盖其他站点／服务／密钥更改。生产操作、认证信息、数据迁移、高影响决策由Codex处理。

推荐 **Native**：Codex在本会话按任务顺序实现，最后进行独立whole-branch review。三份计划的流式接口和数据库迁移紧密衔接，连续实现便于验证边界，减少重复上下文。

可选 **Subagent-driven**：每Task由新子代理实施并独立review后进入下一Task，费用／上下文开销较高；认证、生产／迁移操作仍由Codex保留。此选项只有用户选择后才启用，不能先行分派。

Hermes仅适用于不含秘密和生产数据的机械低风险任务；使用隔离目录、最少上下文、review diff和验证结果后才应用。不可用时由Codex继续，不借此转交部署。

## Plan self-review (2026-10-01)

- Scope：三个子计划覆盖spec §4–9和§11；完整需求对应Plan3的映射表。
- Type/API：共用LearningScope/语言/证据类型归Plan2，stream event归Plan1；Plan3明确消费这些接口，不各建一套。
- Legacy data：rawNote、原ReadingEntry及旧due保留；未标语言的旧AI串不根据词典语言猜测。
- Concurrency：rating的operationId与session/card/sense版本共同验证；worker有lease与expectedRevision。
- Streaming：直接provider.stream；cached completion明确，半截JSON不画进正文，draft不当完成结果保存。
- Frequency：保留wordfreq完整库及归一化，不输出无署名CSV；0缺失显示unknown，非“罕见”。
- Practice：reading有短文／两题／表达；application独立2–3词情境任务，schema不混用。
- Deployment：只本app，增量DB兼容回滚，不自动用旧DB覆盖新日志；配置与书籍完整性单独验证。

本次仅审阅设计、只读诊断和编写计划；还没有安装新业务依赖、实施产品代码、同步这些文档到远端或改变线上服务。
