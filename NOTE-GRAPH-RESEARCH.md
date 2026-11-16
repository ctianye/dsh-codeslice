# 笔记类知识图谱：构建算法调研与 CodeSlice 现状诊断

> 调研对象：CodeSlice DSH 插件「笔记图谱」页（`笔记库 / 图谱列表 / 笔记图谱 / 设置`）。
> 目标：回答两件事 —— ① 当前为什么只显示「1 节点 · 0 连接」；② 笔记类知识图谱到底有哪些可选的构建算法，各自成本与适用边界是什么。
> 本文件只做诊断与选型，不含实现改动。

---

## 0. 结论先行

「1 节点 · 0 连接」**不是渲染失败，也不是数据没加载**，而是当前算法在只有一篇笔记时，拓扑上必然产不出边：

1. 图里**只有笔记节点**（`kind: 'note'`），代码文件 / 符号 / 区间锚点**没有建成节点**；
2. 唯一的两种边（`same_folder`、`shared_reference`）都是「同一分组内两两连边」，而这篇笔记的两个分组各自只有 1 个成员 → 0 条边；
3. 客户端 `WbNoteGraph` 本身是**左侧节点列表 + 右侧邻居列表**的 DOM 视图，不是画布 —— 即使节点变多，用户看到的也只是一串列表，不会出现「图」。

另外一个被忽略的前置事实：**当前项目的代码图谱快照早于 `better-sidebar.js` 的引入时间**，所以这篇笔记指向的代码文件在代码图里根本不存在（详见 §1.4）。这意味着「把笔记挂到已有代码图节点上」这条最省钱的路线，也必须先重建一次代码图索引。

要让**一篇笔记也能成图**，最小正确的做法不是上 LLM GraphRAG，而是：

> 笔记节点 ——(anchors_to)—— 文件节点 ——(同文件/调用/共享符号)—— 其它符号节点

即「代码锚点二部图」打底，再叠加词法相似与社区发现；LLM 只用于「按需生成知识点标题 / 社区摘要」，不做逐块实体抽取。

---

## 1. 现状诊断（可逐条复核）

### 1.1 Host：只建笔记节点

`plugin/lib/notes.js` 的 `buildNotesGraph(notes, folders)`（527–616 行）：

| 位置 | 行为 | 后果 |
|---|---|---|
| 532–549 | 每条笔记建一个 `note://<id>` 节点，`kind: 'note'`，`line/endLine` 恒为 0 | 图中没有 file / symbol / anchor 节点 |
| 559–572 | 按 `folderId` 分组，组内**两两连边** `same_folder` | 组内 1 人 → 0 边；n 人 → n(n-1)/2 条（O(n²)） |
| 575–594 | 按 `${ref.path}#L${ref.line}` 分组，组内两两连边 `shared_reference` | 组内 1 人 → 0 边 |
| 596–601 | `degree` 只按上述两类边统计 | 单笔记 degree = 0，前端显示 `0` |

`codeRefs` 在这里的**唯一用途**是判断「两篇笔记是否引用同一个 `path#Lline`」，它从不参与建节点。

### 1.2 API：stats 里没有社区

`plugin/index.js:1097–1105`：

```js
if (op === 'graph') {
  const graph = buildNotesGraph(document.notes, document.folders);
  return { scope: 'notes', ...graph, total: { nodes: ..., edges: ... }, truncated: false };
}
```

返回 `{ nodes, links, stats }`，`stats` 只有 `notes / folders / links / byRelation`，**没有 `communities`**，所以前端连「社区」这一层都无从渲染。

### 1.3 客户端：列表，不是画布

`plugin/client/src/workbench/pages.js` 的 `WbNoteGraph`（660–805 行）自身注释就写明：

> `The vis-network canvas belongs to the graph area, not this shell.`

实现是：
- 左列 `wb-ng-side`：所有节点平铺成按钮；
- 右区 `wb-ng-main`：选中节点的邻居列表 + 关系标签；
- 顶部一个 `wb-tag` 显示「N 节点 · M 连接」。

也就是说，**「显示成图」这件事在当前客户端根本没有实现**，它与 Host 拓扑是两个独立缺口。

### 1.4 数据与图谱快照

当前笔记库（`%TEMP%\dsh-codeslice\24b5093b22ad73fa.notes.json`）：

| 字段 | 值 |
|---|---|
| id / title | `n_mwf1l32znk` / 插件对象的依赖注入定义 |
| folderId | `null`（无文件夹） |
| codeRefs | 仅 1 条：`plugin/client/src/better-sidebar.js:122–126`，`symbol: null` |
| anchors | 1 条，`status: "fresh"`，`shift: 0`，带 `hash` |
| conversationId | `session:session-5ca4444f-...` |

当前项目代码图谱（`%TEMP%\dsh-codeslice\graphify\24b5093b22ad73fa\graphify-out\graph.json`）：

- 2932 个节点 / 6831 条边 / 103 个文件；
- **`better-sidebar.js` 相关节点 = 0**；
- `graph.json` 生成时间 2026-11-13 18:07，而 `plugin/client/src/better-sidebar.js`（144 行）的最后写入时间是 2026-11-13 23:00。

结论：代码图是**旧快照**，这篇笔记的锚点文件不在其中。因此「笔记挂到代码图已有节点」这条路线，对这条数据当前**同样会得到 0 条边**，必须先重建索引。

### 1.5 三个独立缺口

| 层 | 缺口 | 表现 |
|---|---|---|
| L1 拓扑 | 只有 note 节点 + 同组两两连边 | 1 篇笔记 → 1 节点 0 边 |
| L2 锚点 | 代码文件/符号/区间未建节点 | 笔记与代码之间没有可走的路径 |
| L3 视图 | 列表 + 邻居，无画布、无社区 | 即便有图也「不像图」 |

三者要分别修，只改其中一层都不会让页面「正常显示」。

---

## 2. 笔记类知识图谱的算法族谱

按「信息从哪里来」分五类。实际系统通常是 A+C 或 A+B+C 的叠加，而不是单选。

### A. 硬结构图（structural / explicit edges）

- **节点**：笔记、文件夹、标签、项目、会话。
- **边**：`same_folder`、`same_project`、`shared_reference`、`backlink`（双向链接）、`tag_overlap`、`mentions`。
- **构建**：直接读元数据，无模型。
- **复杂度**：两两连边 O(n²)；改成「按时间/名称排序后相邻成链」则是 O(n)。
- **优点**：零成本、完全可解释、增量只需处理受影响分组、离线可用。
- **缺点**：冷启动极差 —— 单篇笔记、单文件夹、无标签时**天然 0 边**；跨文件夹的同主题笔记永远连不上。
- **定位**：任何方案的底座，但不能单独作为「笔记图谱」。

> 桌面参考实现 `D:\CodeSplit\backend\app\graph\notes.py` 用的就是这一类（`same_folder` / `same_project` / `shared_reference` 稀疏链），单篇笔记在桌面端同样只有 1 节点 0 边 —— 这不是插件独有的 bug，而是该算法的固有边界。

### B. 词法相似（lexical similarity，无向量）

| 方法 | 打分 | 典型参数 | 特点 |
|---|---|---|---|
| TF-IDF + cosine | `cos(q,d)` 稀疏向量夹角 | 词表 = 标题+要点+正文，去停用词 | 无需模型，可增量（维护 df） |
| BM25 | 词项饱和 + 文档长度归一 | `k1≈1.2–2.0`，`b≈0.75` | 检索界标准，短文本上比 TF-IDF 稳 |
| Jaccard（词项/标签） | `|A∩B| / |A∪B|` | 阈值 0.2–0.35 | 极快，适合标签、要点 |
| n-gram / trigram 模糊 | 字符三元组重合 | 阈值 0.4–0.6 | 抗错别字、抗词形变化 |
| SimHash / MinHash | 指纹汉明距离 | 64 bit，距离 ≤ 3 | 近似去重、找「几乎同一篇」 |

- **边**：`semantic_similarity`，带 `score`，置信度标 `INFERRED`。
- **成本**：纯 CPU，千篇量级毫秒~百毫秒；无外部依赖；中文需分词（Node 可用 `Intl.Segmenter`，退化方案是二元组）。
- **优点**：**单篇笔记也能算**（只要有别的笔记/代码注释可比较）；离线；可解释（能给出共享词项）。
- **缺点**：同义改写、跨语言、缩写识别不了；阈值敏感。
- **定位**：插件内最划算的「语义层」，应先于 embedding 落地。

### C. 向量语义 + 社区发现（embedding kNN graph）

流程：句向量（标题+要点，或整篇切块）→ 余弦相似 → top-k 邻居（k=5–10，阈值约 **0.70**，低于 0.65 噪声明显、高于 0.80 漏跨域连接）→ 加权无向图 → Louvain / Leiden 社区。

代表工作是 **GraphRAG-V**：它干脆不建实体三元组，**把每个文本块本身当节点**，embedding 后直接用 **VLouvain** 在 embedding 矩阵上优化模块度（不显式建边、不做 kNN 剪枝），再为每个社区生成两句话摘要。论文报告的代价是「索引从小时级降到分钟级、零抽取 LLM 调用」，代价是**放弃显式实体关系**，只能回答「哪些内容聚在一起」，不能回答「A 和 B 是什么关系」。

- **优点**：能连出人类没写过的关联；社区结构天然适配「主题」视图；增量只需重算受影响块的向量与社区。
- **缺点**：需要 embedding 服务（本地模型或远程 API）；阈值/k 值需要调；可解释性弱于 B。
- **定位**：笔记量大（>50 篇）后再开，作为 B 的升级项。

### D. LLM 图抽取 + 社区摘要（GraphRAG 系）

| 变体 | 实体 | 关系 | 摘要 | 成本 | 质量 |
|---|---|---|---|---|---|
| **GraphRAG Standard** | LLM 抽 entity（名称/类型/描述） | LLM 抽 relationship + strength | 实体/关系描述聚合后再摘要；每个社区生成 report | 最高（抽取约占索引成本 75%） | 最高，可做多跳、可溯源 |
| **FastGraphRAG** | NLTK/spaCy 名词短语，无描述 | 同一 chunk 内共现即关系，无描述 | 不摘要 | 低（省掉大部分 LLM） | 图更噪，适合先验证结构 |
| **LightRAG** | LLM 抽 | LLM 抽 | 双层（实体级/主题级） | 中 | 介于两者 |
| **HippoRAG** | LLM 抽 | LLM 抽 | 无社区摘要 | 中 | 用 PPR/随机游走做联想检索，长尾多跳强 |

标准 GraphRAG 的完整链路（Microsoft 官方 dataflow）：
`Documents → TextUnit(chunk) → LLM 抽 Entity/Relationship/Claim → 实体消歧与描述聚合 → Leiden 层级社区 → 每社区 LLM report → 对实体描述/文本块/社区 report 做 embedding`；查询分 `Local`（实体邻域扇出）、`Global`（社区 report map-reduce）、`DRIFT`（社区定调 + 局部追问）。

成本量级（第三方估算，非官方定价）：GraphRAG 索引约为向量 RAG 的 **100–1000×**；1 MB 语料约 **$5–20**；45k 词用 GPT-4o 约 **$30 / 35 分钟**。对「几十篇笔记的个人知识库」而言，这个成本结构不合理 —— 它适合的是「语料稳定、关系密集、需要全局归纳」的场景。

- **优点**：唯一能产出「实体级关系 + 主题级摘要」的方案；答案可溯源到 chunk。
- **缺点**：抽取质量强依赖提示词；实体消歧是主要误差源；增量更新要维护社区一致性，工程复杂；**单篇笔记时无实体可抽，仍然出不了图**。
- **定位**：CodeSlice 里只应取它的「社区摘要」思想，并且**按需生成**，不做全量预抽取。

### E. 代码笔记专用：锚点图（本项目最该补的一类）

代码笔记与普通笔记的根本差异：笔记天然携带**可定位的代码坐标**（`path + startLine + endLine + symbol + hash + status`）。

建议的节点/边模型：

| 节点 | 说明 |
|---|---|
| `note://<id>` | 笔记 |
| `file://<path>` | 代码文件（全项目一份，可复用代码图节点） |
| `symbol://<path>#<qualified>` | 函数/类/对象，来自 AST 或 graphify |
| `anchor://<noteId>#<i>` | 可选：具体区间锚点，携带 `status` |

| 边 | 语义 | 置信度 |
|---|---|---|
| `anchors_to` | 笔记 → 文件/符号 | EXTRACTED（用户框选即事实） |
| `anchors_range` | 笔记 → 区间锚点 | EXTRACTED |
| `same_file` | 文件内符号互连（稀疏链或调用边） | STRUCTURAL |
| `shared_symbol` | 两篇笔记引用同一符号 | EXTRACTED |
| `calls` / `imports` | 代码图既有关系，可透传 | EXTRACTED |
| `anchor_status` | fresh / moved / drifted / missing（边属性或时间边） | 观测值 |

关键点：**锚点状态本身就是信息**。`moved`（如 `122–126 → 134–138`）说明代码演进过但语义仍在；`missing` 说明笔记已失效。这类边可以做成「时间边」，让图谱回答「这条知识现在还成立吗」，这是纯语义图做不到的。

- **优点**：**单篇笔记即可成图**（note → file → 同文件符号 → 调用者）；零 LLM 成本；完全可解释；与右侧栏「点引用跳代码」天然一致。
- **缺点**：依赖符号表质量；需要代码图新鲜（见 §1.4）。
- **定位**：**L0 必做层**。

### F. 其他值得知道的轻量技巧

- **Personalized PageRank / HippoRAG 式联想**：以当前笔记为种子在图上做 PPR，得到「联想排序」，可用于「相关笔记」推荐，比 kNN 更抗噪。
- **Louvain vs Leiden**：Louvain 快但可能产生内部不连通社区；Leiden 保证连通性、支持层级，是 GraphRAG 的默认选择。插件里若只做单层社区，Louvain 足够。
- **标签共现**：`tag_cooccurrence` 矩阵是成本最低的主题信号，个人笔记库（Obsidian 类）常用「BM25 + 标签 Jaccard + 词项重合 + n-gram」四路打分融合，而非单一模型。
- **实体消歧**：GraphRAG 论文本身用**精确字符串匹配**做实体归并，并说明「重复实体通常会在后续社区摘要里被聚到一起」，所以消歧不必一上来就上 embedding 聚类。

---

## 3. 取舍对比

| 维度 | A 硬结构 | B 词法 | C 向量+社区 | D LLM GraphRAG | E 代码锚点 |
|---|---|---|---|---|---|
| 单篇笔记能否成图 | 否（0 边） | 弱（需可比语料） | 弱（需 ≥2 篇） | 否 | **是** |
| 边际成本 | 0 | ~0（CPU） | 中（embedding） | 高（LLM×chunk） | 0（读 AST） |
| 可解释性 | 高 | 高（共享词项） | 低 | 中（有描述） | **最高**（坐标即证据） |
| 增量更新 | 易 | 易（维护 df） | 中 | 难（社区一致性） | 易（重算锚点） |
| 跨文件夹关联 | 无 | 有 | 有 | 有 | 有（同符号/调用） |
| 主题归纳 | 无 | 弱 | 中（社区） | **强** | 弱 |
| 实现复杂度 | 低 | 低 | 中 | 高 | 中（需符号表） |
| 离线可用 | 是 | 是 | 取决于模型 | 否 | 是 |

---

## 4. 建议路线：分层叠加，先便宜后贵

### L0 结构 + 锚点（必做，零 LLM，解决「0 边」）

1. `buildNotesGraph` 增加 `file` / `symbol` 节点（symbol 缺失时退化为 `file + range` 节点）。
2. 每篇笔记的每个 `codeRef` / `anchor` 产出一条 `anchors_to`（EXTRACTED），文件不存在则产出 `file://<path>` 占位节点 + `status: missing`。
3. 同文件符号之间用**稀疏链**（按行号排序后相邻连边），替代 `same_folder` 的两两连边；`same_folder` 也改稀疏链，避免 O(n²)。
4. `stats` 增加 `byKind`、`communities`、`anchors: {fresh, moved, drifted, missing}`。

**这一层落地后，这篇笔记的预期拓扑**：

```
[note 插件对象的依赖注入定义]
   └─ anchors_to → [file plugin/client/src/better-sidebar.js]
                      ├─ same_file → [symbol plugin 对象]
                      ├─ same_file → [symbol apply 挂载]
                      └─ calls/imports →（来自代码图）
```

节点 ≥ 3，边 ≥ 2 —— 页面不再是「1 · 0」。

### L1 词法相似（本地，零外部依赖，解决「跨文件夹」）

- 标题 + `## 知识点` + `## 要点` 做 TF-IDF/BM25；标签/要点做 Jaccard；二者加权融合（如 `0.6*bm25 + 0.4*jaccard`）。
- 取 top-5、阈值过滤（Jaccard ≥ 0.25 或 BM25 归一化 ≥ 0.3），产出 `semantic_similarity`（INFERRED，带 score 与共享词项作为 evidence）。
- 中文分词优先 `Intl.Segmenter('zh')`，不可用时退化为二元组。

### L2 社区（复用前端已有的社区交互）

- 在加权无向图上跑 Louvain（单层足够），产出 `communities: [{id, label, members, size, hubId}]`。
- 前端 `client/src/graph/view.js` 的社区高亮/聚焦、`style.js` 的白底黑框/蓝底选中、`canvas.js` 的 `focusScale` 都已在代码图谱里实现，笔记图可直接复用同一套。

### L3 LLM 增强（开关，按需，不预生成）

- 「知识点标题」：每篇笔记 1 次轻量调用（已有 `frameTitle` / `notegen` 链路可复用）。
- 「社区摘要」：**点击社区时才生成**，缓存到 notes 文档；不做 GraphRAG 式全量 entity/relationship 抽取。
- 若未来笔记量 >200 且需要「全局主题问答」，再评估 GraphRAG-V 式 chunk 向量 + 社区（成本远低于标准 GraphRAG）。

---

## 5. 落地前必须解决的前置问题

| # | 问题 | 影响 | 处理方向 |
|---|---|---|---|
| P1 | 代码图快照过期（`graph.json` 18:07 < `better-sidebar.js` 23:00） | 锚点指向的文件在代码图里不存在 → 仍 0 边 | 重建 graphify 索引，或让笔记图**自建 file/symbol 节点**而不依赖代码图 |
| P2 | `anchor.symbol = null` | 只能连到 file，连不到具体符号 | 在 notegen 阶段写入 enclosing symbol（`lib/answer.js` 已有该逻辑） |
| P3 | 客户端是列表而非画布 | 节点变多也只是列表变长 | 复用 `client/src/graph/canvas.js` + 已 vendor 的 `vis-network.min.js` |
| P4 | `same_folder` / `shared_reference` 是 O(n²) | 笔记多时边数爆炸（100 篇同文件夹 = 4950 条） | 改稀疏链或 top-k 过滤 |
| P5 | `stats` 无 communities | 前端无法渲染社区 | Host 增字段，前端兼容缺省 |

---

## 6. 需要拍板的口径

- **D1 图的范围**：笔记图 = 「纯笔记层」，还是「笔记层 + 只读复用代码图节点」？建议后者（不改代码图，只挂接）。
- **D2 语义层**：先上词法（BM25/TF-IDF/Jaccard，纯本地），还是直接上 embedding kNN？建议先词法，embedding 留开关。
- **D3 LLM 参与度**：只做「按需生成知识点/社区摘要」，还是做完整 GraphRAG 抽取？建议前者。
- **D4 视图**：改成 vis-network 画布（复用现有 canvas/view/style），还是保留列表面板？建议改画布，列表留作侧栏。
- **D5 索引重建**：是否允许重建一次 graphify（会重扫全项目，耗时但一次性）？若不重建，则 P1 需用「笔记图自建节点」兜底。

---

## 7. 参考来源

- Microsoft GraphRAG 文档：<https://microsoft.github.io/graphrag/>
- GraphRAG 索引方法（Standard / FastGraphRAG 对照）：<https://microsoft.github.io/graphrag/index/methods/>
- GraphRAG 默认数据流（TextUnit → Entity → Community → Report → Embedding）：<https://microsoft.github.io/graphrag/index/default_dataflow/>
- 论文《From Local to Global: A GraphRAG Approach to Query-Focused Summarization》：<https://arxiv.org/pdf/2404.16130>
- GraphRAG-V（chunk-as-node + VLouvain）：<https://webhome.cs.uvic.ca/~thomo/papers/asonam2025-graphrag.pdf>
- 双向 Graph-RAG / 实体消歧与 Leiden 社区增强：<https://arxiv.org/pdf/2608.15919.pdf>
- GraphRAG 实现指南（抽取提示词、成本量级、查询路由）：<https://www.premai.io/blog/graphrag-implementation-guide-entity-extraction-query-routing-when-it-beats-vector-rag-2026/>
- 腾讯云 GraphRAG 技术词条（流程、Leiden、增量与成本）：<https://cloud.tencent.com/developer/techpedia/2720>
- Obsidian Smart Relations（BM25 + 标签 Jaccard + 词项重合 + n-gram 四路融合）：<https://community.obsidian.md/plugins/smart-relations>
- Semantic Note Network（0.70 相似阈值的实践经验）：<https://katrina.dotzlaw.com/articles/obsidiannotes/03semanticnotenetwork/>

> 说明：成本数字来自上述第三方文章与社区报告的估算，非厂商定价；阈值（0.70 / 0.25 等）为经验值，需在真实笔记库上回归后再定。
