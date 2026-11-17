# 🎯 PromptEval (轻量级 AI 评测与 Prompt 回归测试平台)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19.0-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/ORM-Drizzle-orange.svg" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Database-SQLite-003B57.svg" alt="SQLite" />
  <img src="https://img.shields.io/badge/Realtime-Socket.IO-black.svg" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License" />
</p>

> **面向 LLM 应用开发者的端到端评测框架**：告别“凭感觉改 Prompt”的玄学迭代，通过自动化回归评测、多维度评估器、版本快照对比与可视化分析，保障 LLM 输出质量的确定性与可溯源性。

---

## 📌 背景与痛点 (Why PromptEval?)

在实际 LLM 与 Agent 应用开发中（如 RAG 检索生成、复杂 Agent 规划），开发者通常面临以下挑战：
1. **玄学调优**：修改了一个 Prompt 修复了 Case A，却悄悄搞砸了 Case B 和 C（回归恶化）。
2. **缺乏历史基准**：无法对历史不同版本 Prompt / 召回参数进行横向打分对比。
3. **主观评测成本高**：人工校验百条以上数据耗时且标准不一致；简单的字符串匹配无法评估语义质量。

**PromptEval** 提供了轻量、无外部重型依赖的**评测与回归闭环**，支持多模型 API、批量数据集运行、自动多维评分与版本 Diff。

---

## ✨ 核心特性 (Key Features)

### 1. ⚙️ 配置驱动与快照隔离 (Config-Driven & Snapshots)
- **三层解耦设计**：测试用例 (`Test Cases`)、模型供应商 (`Provider API`)、评估器 (`Evaluators`) 完全解耦，支持自由组合编排。
- **不可变运行快照 (`Run Version Snapshot`)**：每次评测固化数据集版本、模型参数与提示词，评测结果可 100% 离线复现与追溯。

### 2. 📏 多维度自动化评估矩阵 (Multi-Evaluators)
- **精确匹配 (Exact Match)**：针对确定性字段（如 JSON Schema 格式、特定关键词召回）。
- **语义相似度 (Semantic Similarity)**：基于向量距离计算生成答案与标准答案（Ground Truth）的语义偏差。
- **LLM-as-Judge（模型裁判）机制**：
  - 内置固定评分量表（Rubric）与评分准则；
  - 强制设定 `temperature = 0` 保证裁判稳定性；
  - 引入**双次评分一致性校验（Double-Evaluation Consistency Check）**，有效遏制大模型评分漂移（Score Drift）。

### 3. 📊 回归分析与多端协同 (Regression & Collaboration)
- **版本自动化 Diff**：一键对比两批次 Run 的指标浮动（准确率、延迟、Token 消耗、得分提升率），并支持导出标准 CSV 报表。
- **CLI & Web 双模式驱动**：评测引擎通过 `Socket.IO` 实时将进度、流式日志与评测结果推送至 React 19 Dashboard，终端与面板实时联动。

---

## 🏗️ 架构与评测流 (Architecture)

```text
 ┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
 │ Test Dataset    │      │ Prompt & Config  │      │ Providers / LLM │
 │ (JSON / CSV)    │      │ (YAML Snapshot)  │      │ (OpenAI/DeepSeek│
 └────────┬────────┘      └────────┬─────────┘      └────────┬────────┘
          │                        │                         │
          └────────────────┐       │       ┌─────────────────┘
                           ▼       ▼       ▼
                     ┌───────────────────────────┐
                     │   PromptEval Core Engine   │
                     │  (Parallel Execution Pool)│
                     └─────────────┬─────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
      [Exact Match]      [Similarity Match]     [LLM-as-Judge]
                                                 (Temp=0 / Rubric)
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │   SQLite (Drizzle ORM)    │ ───► Immutable Snapshot
                     └─────────────┬─────────────┘
                                   │ (Socket.IO Event Stream)
             ┌─────────────────────┴─────────────────────┐
             ▼                                           ▼
      [CLI Realtime Output]                     [React 19 Dashboard]
      - Progress Bar                            - Run Diff & Trends
      - Summary Table                           - Radar Charts & CSV Export
