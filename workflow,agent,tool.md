---
title: "Workflow、Agent、Tools 与 Function Calling：我的理解"
date: 2026-10-15
category: study
description: "从控制权与执行路径出发，梳理 Workflow、Agent、Tools 和 Function Calling 的关系。"
draft: false
---

刚接触 Agent 系统时，我常把 Workflow、Agent、Tools 和 Function Calling 混在一起。后来发现，与其把它们硬排成四层，不如先问一个问题：**下一步由谁决定，又由谁真正执行？**

这篇笔记是在小林 coding 原文基础上的整理与再理解，并结合官方资料修正了几处过于绝对的说法。

## 先看四个概念

| 概念 | 主要职责 | 典型控制者 |
| --- | --- | --- |
| Function Calling | 让模型用结构化参数表达调用意图 | API 与宿主程序 |
| Tool | 向模型暴露可使用的能力 | 调用它的程序或 Agent |
| Agent | 根据目标和环境反馈动态决定下一步 | 模型与运行时共同组成的循环 |
| Workflow | 编排多个步骤、分支与状态 | 预定义规则，也可以包含模型决策 |

这四者可以组合，但不是严格的“从小到大”继承关系。Tool 也不只是一段本地函数：它可以封装搜索、数据库、代码执行、浏览器或远程服务。Function Calling 也只是常见的工具调用接口之一，不负责替应用执行真实操作。

## Tools 与 Function Calling：能力和接口

Tool 是可以被系统调用的能力。为了让模型知道它的用途，通常需要提供名称、描述和参数 schema；真正的执行仍由宿主程序或外部服务完成。

Function Calling 则解决“模型怎样表达调用意图”这个问题。模型可以返回工具名和结构化参数，应用收到后校验参数、执行工具，再把结果送回模型。即使启用了严格 schema，也仍应在执行前检查权限、参数和副作用。

一个最小循环大致是：

```text
用户请求
  → 模型选择工具并生成参数
  → 应用校验并执行工具
  → 工具结果返回模型
  → 模型继续处理或给出答案
```

因此，模型“请求调用”与工具“已经执行”是两件事。涉及发邮件、付款或删除数据时，这个边界尤其重要。

## Agent：动态决定下一步

Agent 的核心不在于是否用了某个固定框架，而在于模型能否根据当前状态和环境反馈，动态决定后续动作。常见过程是：读取目标，选择工具，观察结果，再判断继续、改路还是结束。

ReAct 是一种常见实现方式，但不是所有 Agent 都必须使用 ReAct。Agent 也可以采用规划后执行、反思、状态机或多 Agent 协作等模式。真正关键的是：执行路径并未被开发者完整预先写死，而会在运行中受到模型决策影响。

这种灵活性很适合开放任务，但也会带来成本、延迟和误差累积。实际工程中通常需要最大迭代次数、权限边界、可观测日志、人工确认点和可验证的停止条件。

## Workflow：预定义骨架不等于结果完全确定

Workflow 把任务拆成步骤、分支、并行节点或汇聚节点。开发者通常预先定义了主要结构，所以它适合规则清楚、需要稳定复现的业务。

但 Workflow 里可以包含 LLM、Tool，甚至局部 Agent。只要节点使用了模型或外部系统，具体输出仍可能变化。因此，更准确的说法是：**Workflow 的结构通常更可控，执行结果不一定完全确定。**

常见的 Workflow 模式包括：

- 顺序链：先生成提纲，再检查，最后成文；
- 路由：先识别请求类型，再进入对应流程；
- 并行：多个独立子任务同时执行后汇总；
- 评估与优化：生成结果后，根据明确标准迭代；
- 编排者与工作者：由一个模型动态拆分任务，再汇总多个执行结果。

## 它们怎样一起工作

以“分析财报并把摘要交给管理层”为例，可以这样组织：

1. Workflow 先完成权限检查和文件格式校验。
2. Agent 根据财报内容决定要检索哪些指标，并调用读取、计算或搜索 Tool。
3. 应用通过 Function Calling 接收模型的工具请求，校验并执行。
4. Workflow 对摘要做合规检查，再把邮件内容交给人工确认。
5. 得到确认后，由发送邮件的 Tool 完成最终动作。

这里的主流程有清晰边界，局部分析又保留了 Agent 的灵活性。Anthropic 把这两类系统区分为：Workflow 通过预定义代码路径编排模型和工具；Agent 则让模型动态控制过程和工具使用。两者并非二选一，组合往往更实用。

## 我的判断方法

如果任务步骤稳定、风险高、需要审计，我会优先考虑 Workflow；如果步骤无法提前枚举，需要根据新信息不断调整，我才会引入 Agent。即使采用 Agent，也会尽量缩小它能自主决定的范围，并把外部副作用留在可校验、可确认的边界之后。

Tools 决定系统“能做什么”，Workflow 与 Agent 决定系统“怎样走到结果”，Function Calling 则提供模型与工具之间的一种结构化连接方式。这样理解，比把它们看成固定的层级关系更贴近实际工程。

## 来源与参考

- 原稿整理自小林 coding：[Workflow，Agent，Tools 这三个的概念和区别介绍一下？](https://xiaolinnote.com/ai/agent/3_workflow_tools.html)
- Anthropic：[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- LangChain / LangGraph：[LangGraph 学习与概念入口](https://docs.langchain.com/oss/python/learn)
- OpenAI：[Function calling guide](https://platform.openai.com/docs/guides/function-calling)

原文作者：小林 coding。本文为个人学习整理，完整内容请以原文为准。
