# CodeSlice 代码图谱 + 索引 + 检索 子系统技术审计报告

> 审计对象：`D:\CodeSplit`（只读，本次未修改任何文件）
> 审计范围：`backend/app/graph/**`、`backend/app/indexing/**`、`backend/app/retrieval/**`、`backend/app/api/{graph_api,graph_code,indexing,navigation}.py`、`docs/GRAPH_EXPLORER.md`
> 审计方式：静态阅读（本次会话 pwsh 不可用，全部结论来自 read/grep/glob，未执行任何代码）
> 所有行号指向 `D:\CodeSplit` 下文件的实际行。

---

## 0. 一句话结论

这是一套**设计意图相当克制、工程质量高于平均水平**的本地代码图谱实现：两趟解析（pass1 抽取事实 / pass2 全项目消解）、多级置信度（EXTRACTED/INFERRED/AMBIGUOUS/UNRESOLVED）、epoch 防"构建期间语料变更"的写入竞态，都是正确的工程决策。但它在**图谱构建路径上存在一次重复的全量 AST 解析**、**完全没有增量构建**、**向量检索是纯 Python 暴力循环（不是 numpy）**、且 **JS/TS 继承关系实际上完全没被采集**。这四点是最值得先修的。

---

## 1. 整体架构与数据流水线

### 1.1 两条独立、共享"文件发现规则"的流水线

关键认知：**索引（retrieval）和图谱（graph）是两条独立流水线，只在"哪些文件算源码"这条规则上共享代码**（`backend/app/services/paths.py`），并不共享产物。二者唯一的耦合点是失效通知：

- 索引管线写 `chunks` / `chunks_fts` / `indexed_files`；
- 图谱管线写 `graphs` / `symbol_defs` / `symbol_refs` / `graph_layouts`；
- 索引器在**真正改动过语料**时调用 `drop_graph_cache()` 删掉图谱行（`indexing/indexer.py:340-348`），这就是两者之间唯一的桥。

`graph/__init__.py:1-10` 的模块 docstring **已经过期**：它声称"图谱从 `chunks` 表推导、不重新解析源码"，这与现状（`builder.py:17-22` 明确写了"上一版从 chunks 推导是错的，现在直接读 AST"）正好相反。这是文档债，不是实现债。

### 1.2 完整数据流（ASCII）

```
┌──────────────────────────── 检索/索引管线 ────────────────────────────┐
│                                                                        │
│  POST /api/projects/{id}/index            api/indexing.py:20           │
│            │                                                           │
│            ▼                                                           │
│  start_index_job()  daemon thread        indexing/indexer.py:358       │
│            │                                                           │
│            ▼                                                           │
│  index_project()                         indexing/indexer.py:131       │
│    ├─ _iter_files()   os.walk + prune   indexer.py:59                  │
│    │    ├ paths.is_ignored_dir()         services/paths.py:189         │
│    │    ├ paths.skip_file()  (.env 等)   services/paths.py:210         │
│    │    └ BINARY_SUFFIXES 过滤           services/paths.py:117         │
│    ├─ 增量判定 (size + mtime + hash前缀)  indexer.py:170-180           │
│    ├─ _read_text()  二进制/解码嗅探       indexer.py:83                 │
│    ├─ detect_language()                  indexing/languages.py:67      │
│    ├─ chunk_file() ──► chunk_code()      indexing/chunker.py:344/222   │
│    │     └ Tree-sitter parse (get_parser) indexing/languages.py:127    │
│    │        ├ 函数/类级结构性切片                                        │
│    │        └ 失败 → _text_chunks 60 行兜底  chunker.py:145             │
│    ├─ INSERT chunks + chunks_fts         indexer.py:224-254            │
│    ├─ embed_texts() 分批 → UPDATE vector  indexer.py:289-324           │
│    └─ drop_graph_cache()  ← 唯一的图谱失效点  indexer.py:340           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── 图谱管线 ──────────────────────────────────┐
│                                                                        │
│  GET /api/projects/{id}/graph             api/graph_code.py:182        │
│            │                                                           │
│            ▼                                                           │
│  store.ensure_fresh()                    graph/store.py:665            │
│    │                                                                   │
│    ├─【命中】_row_and_marker() 单条 JOIN  graph/store.py:309            │
│    │        └ _decode() json.loads        graph/store.py:333           │
│    │        └ marker == _token_from_excluded() → return (O(1))         │
│    │                                                                   │
│    └─【未命中】build_and_store()          graph/store.py:488            │
│             │                                                          │
│             ├─ builder.collect_sources()  graph/builder.py:48          │
│             │     └ config_for() 只留 21 种后缀                         │
│             │                                                          │
│             ├─ builder.build_graph()      graph/builder.py:102         │
│             │     └ extract_all()         graph/builder.py:84          │
│             │           └ ast.engine.extract_file()  engine.py:300     │
│             │                ├ 文件/类/函数节点 + 精确行区间            │
│             │                ├ contains / method（EXTRACTED）          │
│             │                ├ rationale 节点 + rationale_for          │
│             │                └ raw_calls / raw_imports / raw_inherits  │
│             │                                                          │
│             ├─ resolve()  第二趟全项目消解  ast/resolve.py:353          │
│             │     ├ imports → imports / imports_from / uses            │
│             │     ├ inherits（仅 Python 真正生效）                      │
│             │     ├ calls（self/Foo./module.func/bare 四类路径）        │
│             │     └ indirect_call（INFERRED）                          │
│             │                                                          │
│             ├─ builder.build_symbol_index()  builder.py:107  ⚠ 又跑一遍 │
│             │                                                          │
│             ├─ detect_communities()  Louvain   cluster.py:40           │
│             ├─ apply_communities()             cluster.py:180          │
│             │                                                          │
│             └─ _persist_if_current()  epoch 校验后同一事务写            │
│                   ├ _write_row() → graphs      store.py:589            │
│                   └ symbols.replace_index()    symbols.py:38           │
│                                                                        │
│  消费方 A：HTTP 读接口     api/graph_code.py                            │
│  消费方 B：Agent 工具集     agent/tools.py:325-354 → graph/service.py   │
│  消费方 C：编辑器导航       api/navigation.py → graph/symbols.py        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.3 各层职责边界（很清晰，值得肯定）

| 层 | 文件 | 职责 | 是否有副作用 |
|---|---|---|---|
| 源发现 | `builder.collect_sources` `store.index_fingerprint` | 读盘 | 只读 |
| pass 1 | `ast/engine.extract_file` | 单文件 → 节点 + 未解析事实 | 纯函数 |
| pass 2 | `ast/resolve.resolve` | 全项目符号表 → 消解边 | 纯函数 |
| 聚类 | `cluster.detect_communities` | Louvain + 打标 | 纯函数 |
| 持久化 | `store._persist_if_current` | 事务 + epoch 乐观锁 | 写库 |
| 查询 | `query.py` | 打分/扩张/渲染成文本 | 纯函数（无 DB） |
| 门面 | `service.py` | 绑 project → 转发 query | 读库 |
| HTTP | `api/graph_code.py` | 序列化 | 读库 |

`query.py` 全程只吃 plain dict（`query.py:16-17` 自称"纯函数，无需数据库，可直接测试"），这个分层是后面"能否包成 DSH Tool"的关键有利条件。

---

## 2. 关键技术选择逐项拆解

### 2.1 Tree-sitter 用法：**没有 query 文件，是数据驱动的通用 walker**

任务里假设"query 文件在哪"——实测**全仓无任何 `.scm` 文件**（glob `backend/app/**/*.scm` 无结果）。实现方式完全不同：

- `ast/__init__.py:80-114` 定义 `LanguageConfig` dataclass，纯数据：`class_types` / `function_types` / `import_types` / `call_types` / `name_field` / `call_function_field` / `accessor_types` / `superclass_field` / `import_parser` 等。
- `ast/languages.py:91-339` 为每个语言实例化一份配置，`BY_SUFFIX`（`languages.py:318-339`）做后缀→配置映射，`config_for()`（`languages.py:342`）是唯一入口。
- `ast/engine.py:300-576` 是**唯一一个**通用 walker，全部语言共用；新增语言是改数据不改代码（`ast/__init__.py:1-7` 明确说明这是照搬 graphify 的设计）。

**支持语言（图谱侧，`languages.py:318-339`）**：Python(`.py/.pyi`)、JS(`.js/.jsx/.mjs/.cjs`)、TS(`.ts/.tsx/.mts/.cts`)、Go、Rust、Java、C(`.c/.h`)、C++(`.cc/.cpp/.cxx/.hpp/.hh`)。

**grammar 加载**：`engine.py:304-317` 用 `importlib.import_module(config.ts_module)` 惰性导入，TypeScript 特判 `.tsx` 用 `language_tsx()`（`engine.py:311-313`）。`ImportError` 被捕获成 `result.error`（`engine.py:323-325`），只损失该语言文件，不炸整轮——这是正确设计。

**索引器侧是另一套 registry**：`indexing/languages.py:52-64` 的 `TREE_SITTER_LANGUAGES` 比图谱侧多了 `json`/`bash`，且 `tsx` 被当作独立语言（`EXT_TO_LANGUAGE` 里 `.tsx → "tsx"`，`languages.py:22`），而图谱侧 `.tsx → TYPESCRIPT` 配置。两套表并存、口径不一致，属于冗余。

**未确认**：`tree_sitter` / `tree_sitter_*` 在 `requirements` 中的实际版本与 ABI（新版 `tree-sitter>=0.22` 改过 `Language()` 构造签名，代码用的是 `Parser(Language(capsule))` 新式写法，因此推断依赖较新，但未核 lock 文件）。

### 2.2 符号 ID 方案

```python
# graph/ast/__init__.py:120-131
f"{path}::{kind}::{name_or___file__}::{line}"
```

例如 `backend/app/api/indexing.py::function::search::70`。设计要点（`ast/__init__.py:120-128`）：

- **保留行号**：同名方法/重载/嵌套类不会被合并成一个节点从而继承两份边。
- 文件节点用 `__file__` 占位，避免与"名字恰好等于文件名的符号"撞车（`file_node_id()`，`__init__.py:134`）。
- 外部依赖节点：`<external>::external::{module}::1`（`resolve.py:481`）。

**评价**：ID 里含行号意味着**任何代码上移一行，该节点的所有边都会重挂到新 ID 上**。对缓存/布局复用是有代价的——`topology_key()`（`store.py:104-129`）正是因此会整体变化，前端保存的布局随之失效。这对"增量编辑体验"是隐性成本。

### 2.3 跨文件符号解析策略（`ast/resolve.py`，951 行，全系统最复杂的一块）

顺序严格：**imports 先于 calls**（`resolve.py:14-17` 明确解释为什么）。

#### (a) 模块 → 文件路径匹配 `_module_suffix_variants`（`resolve.py:63-106`）

对 `app.retrieval.hybrid` 依次生成：
1. 字面量 `app.retrieval.hybrid`
2. 点转斜杠 `app/retrieval/hybrid`
3. 各加 `/__init__`、`/__init__.py`（包导入）
4. **可选**短尾 `hybrid`（`include_short_tail`）

短尾是**危险的**，因此有闸门：`_GATED_LANGUAGES = {python, javascript, typescript}`（`resolve.py:116`）——这三种语言有 import parser，**禁用短尾**；Go/Rust/Java/C/C++ 没有 parser，才保留短尾兜底（`resolve.py:75-79` 解释了 `langgraph.types` 会误配 `types.ts`）。

#### (b) 相对路径 / 点号（`resolve.py:83-86`）

`spec.startswith(".")` → `lstrip(".")`，反斜杠归一化为 `/`。注意：**它只是去掉前缀做"尾巴匹配"，并不基于导入文件所在目录做真正的相对解析**。所以 `from .helpers import x` 在 `a/b/c.py` 里会去找任意 `helpers.py`，若有多个则歧义丢弃。这是可接受的保守策略，但不是编译器级正确语义。

#### (c) 包名映射与"符号 vs 子模块"（`resolve.py:549-571`）

这是整个 resolver 最有价值的一段：`from app.storage import repo` 里的 `repo` 既可能是**符号**也可能是**子模块**。代码先按符号绑定（绑到 `app/storage/__init__.py`），再把 `base + "." + name` 当模块路径再解析一次（`resolve.py:555-571`），把 `repo` 绑到 `app/storage/repo.py`。没有这一步，`repo.get_project()` 全部解析失败。

#### (d) 名称归一化 `_symbol_key`（`resolve.py:109-110`）

`re.sub(r"[^a-z0-9_]", "", name.lower())` —— 小写 + 只留字母数字下划线。

**风险**：`get_user`、`getUser`、`get-user` 三者归一化后**完全相同**。同名冲突判定（`unique()`，`resolve.py:237-246`）会因此把本可解析的调用判为歧义并丢弃（漏边而非错边，方向是安全的，但召回受损）。同理 `settings`（变量）与 `Settings`（类）在归一化后相撞，`symbol_in_file`（`resolve.py:424-437`）特意用**区分大小写**来规避此处，注释也写明了这一点。

#### (e) 四类调用消解（`resolve.py:726-848`）

| 调用形态 | 判定依据 | 置信度 | 代码位置 |
|---|---|---|---|
| `self.f()` / `this.f()` / `cls.f()` | 用 caller 的**精确 class_id**（不用全局同名类）`method_of_class()` | EXTRACTED | `resolve.py:744-751` |
| `Foo.f()` | `Foo` 必须是本文件声明或在**本文件 import 过的文件**里（`class_visible_from`，`resolve.py:288-308`） | EXTRACTED | `resolve.py:752-760` |
| `module.f()` | receiver 是已解析的 import 别名 → `resolve_module_member()`（`resolve.py:643-672`） | EXTRACTED | `resolve.py:761-768` |
| `f()` 裸调用 | 先本文件唯一定义，再 import 绑定表；Python/JS/TS **不再**用"全项目唯一名"兜底 | EXTRACTED | `resolve_bare`，`resolve.py:693-724` |
| 参数位裸标识符 `map(handler)` | pass1 显式标记 `indirect=True` | **INFERRED** | `resolve.py:850-878` |

**`_BORING_CALLEES`**（`resolve.py:50-60`）硬编码约 50 个 Python 内建名，永不解析到项目符号。这是白名单式的（不可扩展），但对 Python 项目有效。

**统计口径很讲究**（`resolve.py:624-641`）：`calls_dropped` 混了两种性质完全不同的丢弃（标准库方法 vs 真歧义），注释明确警告**不要单独把它当质量指标**，要看的应是 `calls_project` 子集上的解析率。这个自我批判写得很到位。

### 2.4 关系类型全集（`ast/__init__.py:31-48`）

**声明了 13 种，实际发射 8 种**：

| 关系 | 发射点 | 实际状态 |
|---|---|---|
| `contains` | `engine.py:428,482` | ✅ 文件→类、类外→函数 |
| `method` | `engine.py:482` | ✅ 类→方法（与 contains 区分开） |
| `rationale_for` | `engine.py:386` | ✅ rationale→宿主 |
| `imports` | `resolve.py:518` | ✅ `import a.b` 型 |
| `imports_from` | `resolve.py:518,568` | ✅ `from a import b` 型 |
| `uses` | `resolve.py:496` | ✅ 指向 `<external>` 节点 |
| `calls` | `resolve.py:791,834` | ✅ |
| `indirect_call` | `resolve.py:866` | ✅ 但恒为 INFERRED |
| `inherits` | `resolve.py:607` | ⚠️ **仅 Python 真正产生**（见 5.2） |
| `implements` | — | ❌ **从未发射**（grep 仅在常量定义处出现） |
| `references` | — | ❌ 从未发射 |
| `declares` | — | ❌ 从未发射 |
| `uses`(符号级) | — | 只用于 external |

**置信度四档**：`EXTRACTED` / `INFERRED` / `AMBIGUOUS` / `UNRESOLVED`（`__init__.py:45-48`）。设计原则值得引用（`builder.py:13-16`）："一个自信的错误 caller 会被用户当成事实读，而缺失的 caller 只是留个空"。

### 2.5 聚类算法与参数（`cluster.py`）

- **算法**：`networkx.community.louvain_communities(weight=None, seed=0)`（`cluster.py:66`）。选 Louvain 而非 Leiden 的理由写在 `cluster.py:1-7`：Leiden 需要 `igraph`/`leidenalg` C 扩展，Electron 打包成本高于收益。
- **参数**：`seed=0` 硬编码（`detect_communities(..., seed: int = 0)`，`cluster.py:44`），保证同图重建颜色不重排。
- **孤立节点先剔除**（`cluster.py:59-60`）：`degree > 0` 才进 Louvain，`degree == 0` 全部汇入一个显式的 `POOLED_LABEL = "未分类"`（`cluster.py:28`）。
- **单例社区合并**：`MIN_COMMUNITY_SIZE = 2`（`cluster.py:23`），小于 2 的全部并入 pooled（`cluster.py:74-78`）。这条规则解决了"40 个孤立文件 → 40 个社区"的图例灾难。
- **社区命名**：不是取度数最高的节点，而是**取成员最多的文件**（`_summarise`，`cluster.py:113-177`）。理由（`cluster.py:120-128`）：hub 常常是 `NotFound` / `get_conn` 这类节点，拿它命名图例会变成异常类名。多文件时加 `+N` 后缀（`cluster.py:149`）。
- **重复标签消歧**：两个社区同名 → 追加 `representative`（`cluster.py:99-108`）。
- **降级**：Louvain 抛异常 → 整图一个社区（`cluster.py:68-71`），不 500。

**评价**：`_summarise` 里 `graph.degree(nid)` 对每个成员调用，是 O(V) 每次、总计 O(V²)——大图上是热点，但只在构建路径跑一次。

### 2.6 图谱存储 schema

表定义在 `core/db.py`（本次只读引用，不展开迁移）：

| 表 | 主键 | 字段 | 索引 | 行号 |
|---|---|---|---|---|
| `graphs` | `(project_id, scope)` | `payload TEXT`(全量 JSON)、`built_hash`、`schema_version`、`node_count`、`edge_count`、`built_at` | PK | `db.py:188-198` |
| `graph_layouts` | `(project_id, scope, layout_key)` | `positions TEXT`、`node_count`、`updated_at` | PK | `db.py:203-211` |
| `symbol_defs` | `(project_id, node_id)` | name/normalized/kind/path/start_line/start_col/end_line/end_col/parent_node_id/signature/doc/language | `idx_symbol_defs_pos(project_id,path,start_line)`、`idx_symbol_defs_name(project_id,normalized)` | `db.py:216-237` |
| `symbol_refs` | `id AUTOINCREMENT` | path/start_line/start_col/end_line/end_col/name/normalized/kind/from_node_id/target_node_id/confidence | pos / target / name 三个索引 | `db.py:239-256` |
| `chunks` | `id` | 含 `vector BLOB`、`embed_model`、`hash`、`tokens` | `(project_id)`、`(project_id,path)` | `db.py:75-94` |
| `chunks_fts` | `rowid` | fts5(content,path,symbol) `tokenize='unicode61'` | — | `db.py:96-101` |

**关键设计**：`graphs.payload` 是**一整块 JSON TEXT**，不是规范化表。整个图一次 `json.loads` 进内存（`store.py:333-339`）。这是"点击一次 = 一次主键查询"的前提（`graph_code.py:5-7` 明确算过账：几千符号 ≈ 1-2MB，localhost + GZip 可接受）。

`symbol_defs` / `symbol_refs` 是**第二个维度**：图谱每对 (caller, callee) 只留一条边，无法回答"光标下这个标识符"，所以额外存 per-occurrence（`symbols.py:1-14`）。

### 2.7 增量构建策略：**图谱没有增量，只有索引有**

- **索引**：真正的增量。`indexer.py:170-180` 用 `hash` 前缀 + `size` + `mtime`（1e-3 容差）判定跳过；`stats["skipped"]` 计数。文件变了则整文件 `DELETE chunks + chunks_fts` 再重插（`indexer.py:218-220`），**不是 chunk 级 diff**。
- **图谱**：**全量**。`store.py` 全文没有任何 per-file 更新路径。任何一次"有文件被改动"的索引运行（`stats["files"] > 0 or stale`，`indexer.py:340`）都会 `drop_graph_cache()`，下次打开图谱就**重新 collect_sources + 全项目 AST 解析 + 全项目 resolve + 全量 Louvain**。

这是本系统最大的架构性成本，也是 5.1 的主要性能隐患来源。

### 2.8 缓存 / 失效机制（设计得最好的部分）

`store.py:17-65` 的模块 docstring 本身就是一份完整契约说明，五条不变量（1 schema version、2 marker、3 source content 由 indexer 负责、4 epoch、5 显式重建）。

**`graph.json.stale` 是什么**：
`<root>/.codeslice/graph.json` 是**旧版**的落盘格式。现在 SQLite 的 `graphs` 行才是权威，但为了避免老用户被迫重建一次，`_import_legacy()`（`store.py:615-647`）会：
1. 读旧 JSON；
2. 若其 `built_hash` 是全量内容哈希，与 `_sources_digest(collect_sources(...))` 比对（`store.py:636`）；
3. 匹配 → 打上新 marker 存入 SQLite，**免费升级**；不匹配 → 返回已读到的 sources 供重建复用（避免二次走盘）；
4. 无论哪条路，最后都 `_retire_legacy_file()`（`store.py:650-662`）把 `graph.json` **重命名为 `graph.json.stale`**。

重命名而非删除的理由（`store.py:650-656`）：它是派生缓存不是用户数据；留着旧字节可供事后排查，但**新代码路径永不读取** `.stale`。若不重命名，每次启动都会重新走一遍全树哈希（正是被淘汰的那个慢路径）。测试断言了这一点：`test_graph_cache.py:297-298`。

**epoch 机制**（这块做得最漂亮）：`build_and_store` 在**读树之前**采样 `graph_epoch:{project_id}`（`store.py:504`），在**写事务内部**再读一次比对（`store.py:556-567`），不等就丢弃整个构建结果。这消灭了"构建窗口内语料被换掉 → 旧图被盖上新鲜 marker → 永久性 stale"这个最难查的 bug。

**热路径**：`_row_and_marker()`（`store.py:309-322`）用一条 `LEFT JOIN projects` 同时取 payload 和 marker 依赖的 `excluded` 列，所以一次点击 = **1 条 SELECT + 1 次 json.loads**。契约被测试直接插桩断言（`store.py:45-49`）。

---

## 3. 索引与检索子系统

### 3.1 indexer 扫描 / 过滤 / 识别 / 切片

**扫描**（`indexer.py:59-81`）：`os.walk` + `onerror=lambda _: None`，并**在 walk 时剪枝** `dirnames[:]`。注释（`indexer.py:60-66`）记录了一个真实事故：改用 `rglob` 时，`release-*` 构建目录里的锁定二进制会抛 `WinError 1920` 导致整轮索引中止。这个修正很务实。

**过滤**（多层，口径统一在 `services/paths.py`）：
1. `is_ignored_dir`（`paths.py:189-198`）：`DEFAULT_IGNORES` 精确名 + `IGNORED_DIR_PATTERNS` 正则（含 `^dist-.*$`、`^unpacked$`，`paths.py:80-82`）；
2. `skip_file`（`paths.py:210-219`）：`.env` / `.env.*` 一律拒绝（**凭证不进索引、不进 embedding**），lockfile 名单（`paths.py:85-99`），`IGNORED_SUFFIXES`（`.lock/.map/.log/.patch` 等）；
3. `BINARY_SUFFIXES`（`paths.py:117-163`）：含 `.asar/.bin/.node/.wasm/.snapshot` 等 Electron 产物；
4. `looks_binary()`（`paths.py:201-207`）：`b"\x00" in data[:8192]`，挡住无扩展名可执行文件；
5. `MAX_FILE_BYTES = 1_500_000`（`indexer.py:32`）、`st_size == 0` 跳过（`indexer.py:78`）。

`_read_text`（`indexer.py:83-107`）还有一层解码嗅探：UTF-8 严格解码失败后，若 U+FFFD 数量 `> max(8, len//100)` 就判为二进制丢弃。注释说明动机：一个 `.asar` 的乱码 chunk 足以让整批 embedding 超上下文而全部失败。

**语言识别**（`indexing/languages.py:67-78`）：后缀表优先，`Dockerfile/Makefile/CMakeLists.txt` → `text`，`#!` shebang 嗅探 python/node，兜底 `text`。

**切片策略**（`chunker.py`，347 行）：
1. `get_parser(language)` 拿 Tree-sitter parser；无 grammar → `_text_chunks` 60 行定长（`chunker.py:23,145-174`）。
2. `root.has_error` → 直接降级为行带（`chunker.py:233-235`）。
3. 遍历类/函数节点：`FUNCTION_TYPES` / `CLASS_TYPES` 是**第三套**语言表（`chunker.py:27-64`，与 `graph/ast/languages.py` 又不完全一致）。
4. 函数节点会**向上吞并前 3 行内的文档/注释块**（`chunker.py:273-277`）。
5. 单个符号超过 `MAX_CHUNK_LINES=220` → 递归子节点；仍超 → `_text_chunks` 再切（`chunker.py:331-338`）。
6. **模块级空隙单独成块**（`chunker.py:303-328`），保证 import 区有独立可引用的行号——这点很重要，`resolve.py` 的 import 事实和引号定位都依赖它。
7. 内容硬截断 `MAX_CHUNK_CHARS=8000`（`chunker.py:25`，在各处 `[:MAX_CHUNK_CHARS]`）。
8. Markdown 走独立 `chunk_markdown`（按标题切，`chunker.py:177-219`）。

### 3.2 FTS5 用法

- 虚表：`chunks_fts USING fts5(content, path, symbol, tokenize='unicode61')`（`db.py:96-101`），**不是 external-content 表**，内容物理存了两份（`chunks.content` 原文 + `chunks_fts.content` 分词袋子）。
- 写入：`tokenize.index_text()`（`tokenize.py:52-61`）产出空格分隔的 token 串（`indexer.py:246-254`）。
- 查询：`fts_query()`（`tokenize.py:64-69`）生成 `"t1" OR "t2" OR ...` 的**纯 OR 查询**，每个 token 加引号。`MAX_QUERY_TOKENS=24` 上限。
- 排序：先 `bm25(chunks_fts)` 取 `candidates = max(limit*5, 40)`（`hybrid.py:84`），再用自定义覆盖度重排（见 3.4）。
- 版本：`tokenize.INDEX_VERSION = 2`（`tokenize.py:21`），`core/db.py:418` 读取它决定是否重建 FTS。
- 异常兜底：`except Exception: return []`（`hybrid.py:98-99`）——**静默失败**，见 5.4。

### 3.3 embedding 与向量检索：**是纯 Python，不是 numpy**

任务描述假设"numpy 余弦"。**实测 `hybrid.py` 只 import 了 `math`、`typing.Protocol`、`get_conn`、`emb`、`tokenize`（`hybrid.py:8-15`），全仓无 numpy 参与余弦计算。**

实现（`hybrid.py:25-54`）：

```python
# SqliteVectorStore.__init__ : 一次性把该项目所有向量读进内存
self._vectors = [(r["id"], emb.unpack(r["vector"])) for r in rows]   # hybrid.py:40

# search : 逐条 Python 双循环
for chunk_id, vector in self._vectors:
    if len(vector) != len(query_vector): continue
    dot = sum(a * b for a, b in zip(query_vector, vector, strict=False))
    vn  = math.sqrt(sum(v * v for v in vector)) or 1.0
    scored.append((chunk_id, dot / (qn * vn)))
scored.sort(...)                                                      # hybrid.py:46-54
```

- 存储：`array.array("f")` float32 → `tobytes()`（`embeddings.py:85-94`）。
- **模型切换处理**：`SqliteVectorStore.__init__` 只取 `embed_model == 当前模型名` 的行（`hybrid.py:32-37`），维度和语义都不混用；索引器另有补建逻辑（`indexer.py:280-287`）。
- **补建逻辑**：索引后统一查 `embed_model IS NULL OR <> 当前模型` 的 chunk 塞进 `pending_vectors` 重嵌入（`indexer.py:280-287`）。分批写库（`indexer.py:299-318`），失败按批降级而非全崩。`embeddings.py:57-71` 还有"整批失败 → 逐条重试 → 逐步截短到 3000/1500 字符"的三级降级。
- `is_configured()`（`embeddings.py:104-109`）的布尔表达式依赖 Python 优先级 `(A and B) or (C and D)`，语义正确但可读性差。

### 3.4 hybrid 融合打分公式（完整还原）

```
keyword 侧 (hybrid.py:101-114)：
  candidates = 按 bm25 取 max(limit*5, 40) 条
  coverage   = |query_tokens ∩ chunk_tokens| / |query_tokens|      # 集合覆盖
  bm25_part  = 1 / (1 + max(0, -bm25))                             # bm25 越低越好且为负
  score_kw   = 0.75 * coverage + 0.25 * bm25_part
  → 降序取 limit

vector 侧 (hybrid.py:117-134)：
  score_vec  = cosine(query_vec, chunk_vec)  （纯 Python）
  → 降序取 limit

融合 (hybrid.py:137-155) —— Reciprocal Rank Fusion：
  RRF_K = 60
  score(c) = Σ_over_result_sets  1 / (60 + rank_in_that_set)
  → 降序取 top_k

入口 (hybrid.py:158-169)：
  kw  = keyword_search(project_id, q, limit=max(top_k,12))
  vec = vector_search(project_id, q, limit=max(top_k,12))
  merged = RRF([kw, vec]) if (kw 和 vec 都非空) else (kw or vec)[:top_k]
  → pop("chunk_id")，content 超 4000 字符截断
```

注意 `context_for_prompt`（`hybrid.py:172-186`）用 `budget_chars=12000` 逐块累加，超预算**直接 break 而非裁剪**，所以最后一个块可能被整块丢弃。

### 3.5 tokenize 的作用（中英混排的关键补丁）

`retrieval/tokenize.py` 解决的是具体问题（`tokenize.py:1-9`）：SQLite `unicode61` 把整段连续 CJK 当成**一个** token，于是 `代码阅读` 永远匹配不到 `本地优先的代码阅读助手`。

方案：**不加分词库，双边生成重叠 CJK bigram**（`tokenize.py:24-27`）。
`本地优先的代码阅读助手` → `本地 地优 优先 先的 的代 代码 码阅 阅读 读助 助手`
查询 `入口` → `入口`，能在任何相邻出现处命中。

- `_RUN_RE = [A-Za-z_][A-Za-z0-9_]* | [CJK]+`（`tokenize.py:16`）：ASCII 标识符整体保留（**代码搜索必须保住 `get_conn` 这种下划线词**），CJK 才切 bigram。
- 单字符 ASCII 丢弃（`tokenize.py:37-38`）。
- `index_text()`：多字段合并去重成空格串。
- `search_tokens(limit=24)` / `fts_query()`。
- `MAX_QUERY_TOKENS=24`、`INDEX_VERSION=2`。

**评价**：这是本仓最"性价比高"的一个设计——20 行解决中文检索，无依赖。局限：bigram 会让索引膨胀约 2×（中文内容），且不支持单字检索语义（单字 CJK run 走 `_cjk_bigrams` 返回 `[run]`，`tokenize.py:25-26`）。

---

## 4. HTTP 接口契约表

### 4.0 先说一个**范围认知纠偏**

`backend/app/api/graph_api.py` **不是代码图谱接口**。它 `prefix="/agent/graph"`（`graph_api.py:23`），返回的是 **LangGraph Agent 工作流拓扑**（节点配置 + 边 + `_EDGE_LABELS`，`graph_api.py:30-64`），写的是 `node_config`。与本报告的 CodeSlice 图谱无关，属于 lead 的 "Agent/编排" 范围。**代码图谱接口全部在 `graph_code.py`。**

**鉴权**：除特别说明外全部要求 `X-Session-Token`（`deps.py:14-21`，逐字比对 `settings.token`，不符 401）。`ProjectDep` 做 project 404（`deps.py:24-30`）。

### 4.1 图谱与布局

| # | 方法 & 路径 | 入参 | 出参 | 前端调用方 | 后端位置 |
|---|---|---|---|---|---|
| 1 | `GET /api/projects/{pid}/graph` | 路径 `pid` | `{nodes[], edges[], communities[], stats{...,rebuilt}, layout_key, layout{}}` | `GraphView.tsx:130` (`api.getGraph`) | `graph_code.py:182-198` |
| 2 | `POST /api/projects/{pid}/graph/build` | 路径 `pid` | `GraphBuildResult{nodes,edges,communities,rebuilt,stats}` | `GraphView.tsx:261` (`rebuildGraph`) | `graph_code.py:207-218` |
| 3 | `PUT /api/projects/{pid}/graph/layout` | `{layout_key:1..128, positions:{id:{x,y}}}` | `{ok:true}` | `GraphView.tsx:314` | `graph_code.py:201-204` |
| 4 | `GET /api/projects/{pid}/graph/node` | `node_id:1..`, `depth:1..3=1` | `{node, edges[], neighbors[]}`（`neighbors` 与 `edges` **内容完全相同**） | `api.ts:281 getGraphNode` **但 grep 未找到组件调用 → 未确认** | `graph_code.py:274-342` |
| 5 | `GET /api/projects/{pid}/graph/locate` | `path:1..`, `line>=1` | `{node｜null}` | `CodePane.tsx:789` | `graph_code.py:258-271` |
| 6 | `GET /api/conversations/{cid}/graph-targets` | 路径 `cid` | `{project_id, targets[]}` | `ConversationGraphLink.tsx:28` | `graph_code.py:131-171` |

### 4.2 笔记图谱

| # | 方法 & 路径 | 入参 | 出参 | 调用方 | 位置 |
|---|---|---|---|---|---|
| 7 | `GET /api/graphs/notes` | — | `{nodes,edges,communities,stats,layout_key,layout}` | `GraphView.tsx:131` | `graph_code.py:74-77` |
| 8 | `PUT /api/graphs/notes/layout` | 同 #3 | `{ok:true}` | `GraphView.tsx:314` | `graph_code.py:80-83` |
| 9 | `POST /api/graphs/notes/summary` | `{node_id:1..2048}` | `{node_id,scope,summary,neighbor_count,edge_count}` | **前端只用流式版** → 未确认 | `graph_code.py:86-88` |
| 10 | `POST /api/graphs/notes/summary/stream` | 同 #9 | SSE `delta`/`done`/`error` | `RelationshipSummary.tsx:49` | `graph_code.py:91-97` |

### 4.3 代码图谱 AI 总结

| # | 方法 & 路径 | 入参 | 出参 | 调用方 | 位置 |
|---|---|---|---|---|---|
| 11 | `POST /api/projects/{pid}/graph/summary` | `{node_id}` | 同上 | 未确认（前端走流式） | `graph_code.py:115-118` |
| 12 | `POST /api/projects/{pid}/graph/summary/stream` | `{node_id}` | SSE | `RelationshipSummary.tsx:49` | `graph_code.py:121-128` |

SSE 失败帧处理在 `_summary_frames`（`graph_code.py:50-66`）：HTTP 已 200，模型挂了只能发 `{"type":"error"}` 帧。

### 4.4 编辑器导航（symbols 层，不走图谱 payload）

| # | 方法 & 路径 | 入参 | 出参 | 调用方 | 位置 |
|---|---|---|---|---|---|
| 13 | `GET /api/projects/{pid}/definition` | `path`, `line>=1`, `column>=1` | `{targets[], candidates[], reason, word}` | `CodePane.tsx:810` | `navigation.py:211-227` |
| 14 | `GET /api/projects/{pid}/references` | 同上 | `{target, locations[], truncated, candidates[], reason, word}` | `CodePane.tsx:857` | `navigation.py:230-274` |
| 15 | `GET /api/projects/{pid}/hover` | 同上 | `{contents, range{start_line,start_column,end_line,end_column}, kind, path, line, word}` | `codeNavigation.ts:65` | `navigation.py:277-309` |
| 16 | `GET /api/projects/{pid}/symbols` | `q`, `limit:1..200=50` | `{symbols[]}` | 后端注释称"未来 Ctrl+T 面板"（`navigation.py:319`）→ **当前无前端调用** | `navigation.py:312-322` |

`reason` 取值域：`file_not_found` / `ambiguous` / `external` / `unresolved` / `no_definition`（`navigation.py:129,181,202`）。`_prefer()`（`navigation.py:88-111`）会折叠 `from app import service` 产生的 `__init__.py` + `service.py` 双命中。

### 4.5 索引与检索

| # | 方法 & 路径 | 入参 | 出参 | 调用方 | 位置 |
|---|---|---|---|---|---|
| 17 | `POST /api/projects/{pid}/index` | `force:bool=false` | `{job_id}` | `api.ts:200 startIndex` **无组件调用 → 未确认** | `indexing.py:20-24` |
| 18 | `GET /api/projects/{pid}/index` | — | `IndexStatus{project,last_job,files,chunks,vectors,indexed_at,embed_models,active_embed_model,embedding_configured}` | `useIndexJob.ts:43` | `indexing.py:27-67` |
| 19 | `GET /api/projects/{pid}/search` | `q:1..`, `top_k:1..30=8` | `RetrievedChunk[]`（**裸数组**，非 `{items}`） | `FilePanel.tsx:42` | `indexing.py:70-77` |
| 20 | `GET /api/jobs/{job_id}` | 路径 | job 对象 | `api.ts:207 getJob`（调用方未确认） | `indexing.py:80-85` |

**契约层观察**：`stats.rebuilt` 是"是否本次重建"的唯一观测量；`embed_models` 多值意味着索引正处于模型迁移中（`indexing.py:50-56`）。

---

## 5. 质量与隐患

### 5.1 性能

**(P0) 图谱构建时 AST 被完整解析两遍。**
`store.build_and_store`（`store.py:507-508`）：
```python
graph = builder.build_graph(sources=sources, root=root)        # → extract_all + resolve
index = builder.build_symbol_index(sources=sources, root=root) # → extract_all + resolve 又一次
```
虽然 `sources` 复用避免了二次读盘，但 `_build()`（`builder.py:121-132`）每次都重跑 `extract_all()`（全量 Tree-sitter parse）和 `resolve()`（全量符号消解 + Louvain 之前的所有边）。`build_symbol_index` 存在的理由是"保持 `build_graph` 是测试和调用方唯一 patch 点"（`builder.py:107-117`）——这是**测试便利性换生产性能**。`resolve(with_index=True)` 本来就是同一趟能产出 `defs/refs` 的（`resolve.py:948-951`），完全没必要跑两次。修法：一次 `resolve(with_index=True)`，图形部分取 `nodes/edges/stats`。

**(P0) 图谱无增量。** 改 1 个文件 → 全项目重解析 + 全量 Louvain（见 2.7）。大仓（>5k 文件）上这是数十秒级阻塞，且发生在 `GET /graph` 同步请求里（`graph_code.py:191`）。

**(P0) 同步阻塞的 HTTP 入口。** `GET /graph` → `ensure_fresh` → 可能全量 rebuild，全程在 FastAPI 同步 def 里跑（`graph_code.py:182-198`）。只有 per-project `threading.Lock`（`store.py:94,203-209`）串行化，没有超时、没有后台 job、没有进度。第一个打开者吃满这几秒。

**(P1) 向量检索全内存 + 纯 Python 双循环**（3.3）。每次 `search` 都把该项目**全部**向量读出并反序列化（`hybrid.py:33-40`），然后 `sum(a*b for ...)` 逐维循环。1 万 chunk × 768 维 = 768 万次 Python 乘法**每次查询**。这是本仓最容易被误判的地方：任务书以为是 numpy 向量化，实际并非。改成 numpy（或至少 `array` + 预归一化缓存模长）是低风险高收益优化。

**(P1) 索引每文件一个事务。** `with write_conn() as conn:` 在 `indexer.py:192` 的 per-file 循环内部，N 个文件 = N 次 commit。WAL 下可接受但不理想。

**(P1) `pending_vectors` 全量驻留内存**（`indexer.py:164,256`）：存的是所有待嵌入 chunk 的**完整正文**，大仓可达数百 MB。

**(P2) `_summarise` 的 O(V²) degree 查询**（`cluster.py:142,166`）。

**(P2) `_word_at` 每次 F12 读整个文件头**（`navigation.py:47`，`read(settings.max_file_bytes)`），且 `definition`/`references`/`hover` 三个接口都各自调一次 `_ensure`（`navigation.py:205-208`）。

**(P2) `methods_of_class` 是 O(n) 全节点扫描**（`resolve.py:251-264`），但**该方法已无调用方**（resolve 走 `method_of_class`，`resolve.py:266`），属死代码；若复活会变 O(n²)。

### 5.2 正确性风险

**(C1) JS/TS 的继承关系完全没有。** `_JS_COMMON` 里 `superclass_field=None`、`superclass_name_types=frozenset()`（`languages.py:205-206`），而 `engine.py:435-452` 依赖 `config.superclass_field`：
```python
bases_node = _named_child(child, config.superclass_field)   # field=None → 返回 None
if bases_node is not None: ...                              # 永远不进入
```
`_named_child`（`engine.py:96-99`）对 `field=None` 直接 `return None`。因此 **`extends` / `implements` 在 TS/JS 上一律不产生 `inherits` 边**，`REL_IMPLEMENTS` 全系统从未发射。对一个以 React/TS 为主要场景的"读代码 Agent"来说，这是明显的能力缺口。注释（`languages.py:212-218`）只解释了为什么去掉 type alias，没解释继承为何缺席 → 更像遗漏。

**(C2) 解析失败的文件在图谱中**静默消失**。** `extract_file` 在 parse 失败时提前返回（`engine.py:323-328`），`result.nodes` 为空；`extract_all` 只 `log.debug` 后照常 append（`builder.py:92-96`）；于是该文件**没有任何 file 节点**。而 `languages.py:316-317` 的注释声称"其他语言仍会生成 file 节点，图谱不会静默残缺"——**与 `builder.py:69-70` 的 `if config_for(rel) is None: continue` 直接矛盾**。两处注释互相打架，实际行为是"未知后缀 + 解析失败"双双消失，且用户没有任何可见提示（只有 debug 日志）。文档与实现不一致 = 后续维护者会踩。

**(C3) `_symbol_key` 归一化过宽导致漏边。** 见 2.3(d)。`getUser` 与 `get_user` 归一化后同键，`unique()` 判歧义 → 丢弃。方向安全（不会错边），但召回受损，且用户无法感知"为什么这条调用链断了"。

**(C4) 相对导入不是真相对解析。** `_module_suffix_variants` 只 `lstrip(".")` 后做后缀匹配（`resolve.py:83-86`），不看导入者所在目录。`a/b/helpers.py` 与 `x/y/helpers.py` 并存时，`from .helpers import f` 判歧义丢弃。保守但会在 monorepo 里丢大量边。

**(C5) 同名符号冲突的兜底不对称。** `resolve_bare`（`resolve.py:693-724`）先查本文件唯一性，再查 import 绑定；但**若本文件有两个同名 `run`**，`local_counts[key] == 1` 不成立 → 直接掉到 import 分支 → 可能解析到 import 进来的另一个 `run`。即"本文件歧义"会被错误地让位给"import 候选"，这比直接丢弃更接近错边。

**(C6) 缓存窗口内的 stale 服务是**设计接受**的。** `store.load_cached`（`store.py:342-353`）**不校验 marker**，`service.load`（`service.py:23-29`）和 `_cached_or_build`（`graph_code.py:100-112`）都用它。所以：用户改了代码但 **watcher 没跑/没启** → Agent 工具（`context_for_question` 等）会持续拿到旧图并当事实呈现。注释（`graph_code.py:100-107`）承认这是"stale-by-edges 优于卡住点击"的取舍。**但 Agent 回答场景与 UI 点击场景的风险不同**，这里没有区分。

**(C7) 循环依赖**：解析层无风险（AST 不会递归 import）；`resolve.py` 的 import 图允许环（`add_edge` 无环检测），`query.shortest_path_text` 用 `seen` 集合防环（`query.py:462,475`），`expand` 用 `visited` 防环（`query.py:254,281`）。**这部分是对的**，无需担心。

**(C8) `notes.py` 的链式连接。** `connect()` 用 `zip(unique, unique[1:])`（`notes.py:102`）把同组笔记连成一条链而非全连接 —— 这是**故意的稀疏化**（`notes.py:96-99`）。但 `strict=False` 会让 1 元素组静默不连边，属预期。

### 5.3 数据结构冗余

| 冗余点 | 位置 | 说明 |
|---|---|---|
| 语言表三套 | `graph/ast/languages.py:318`、`indexing/languages.py:14,52`、`indexing/chunker.py:27,52` | 后缀映射、TS 语言集、函数/类节点名各写一遍，`.tsx` 在两处语义不同（`tsx` 语言 vs TYPESCRIPT 配置）|
| `graph/node` 返回 `neighbors` == `edges` | `graph_code.py:342` | 同一份数据发两遍，纯浪费带宽 |
| FTS 内容双存 | `db.py:75-101` | `chunks.content` 原文 + `chunks_fts.content` 分词袋 |
| `_import_recipe` 双表 | `resolve.py:195-199` | `import_bindings` 与 `imported_modules` 存近似信息 |
| `file_languages` / `by_file` | `resolve.py:191,201` | 可由 nodes 派生但被缓存，属于合理冗余 |
| 死代码 | `engine.py:51 MAX_RATIONALE_DISTANCE`（定义未用）、`engine.py:102 _walk_descendants`（未用）、`hybrid.py:18 FUZZY_LIMIT`（未用）、`chunker.py:91 _enclosing_class`（函数体 `return None` 占位，未调用）、`chunker.py:341 _IMPORT_RE`（未用）、`resolve.py:251 methods_of_class`（无调用方）、`store.invalidate`（**全仓无调用方**，索引器直接调 `db.drop_graph_cache`）| 已 grep 确认 |
| 过期 docstring | `graph/__init__.py:1-10`（仍说从 chunks 推导）；`languages.py:316-317`（与 builder 矛盾）| 会误导后续维护 |

### 5.4 缺少测试的地方

现有测试相当扎实：`test_graph_build.py` 45 个用例，覆盖跨文件调用、别名、JSX、继承、external、collect_sources 过滤；`test_graph_cache.py` 覆盖缓存命中/零源码访问/epoch/legacy 导入；`test_navigation.py`、`test_index_retrieval.py`、`test_chunker.py`、`test_tokenize.py` 都在。

**但 grep 确认以下完全没有测试**：

| 未覆盖模块 | 影响 |
|---|---|
| `graph/cluster.py` 全文（`detect_communities` / `apply_communities` / `_summarise`）| Louvain 降级路径、单例合并、重复标签消歧全靠人眼 |
| `graph/query.py` 的打分/种子/扩张/路径（`score_nodes` / `pick_seeds` / `expand` / `shortest_path_text` / `neighbors_text`）| 这是 Agent 工具集的核心算法，**零直接单测** |
| `graph/store.py` 的 `topology_key` / `save_layout` / `load_layout` | 布局机制无测试 |
| `graph/relationships.py` 的 `_evidence` 413 分支、`summarize_stream` 降级分支 | 仅有 `test_graph_relationships.py` 的端到端 |
| `retrieval/hybrid.py` 的 `_rrf_fuse` 与 `keyword_search` 覆盖度公式 | 无单测 |
| `indexing/indexer.py` 的 watcher、`_RERUN_REQUESTED` 合并、`_read_text` 嗅探阈值 | 无单测 |
| Graph 工具的四个入口（`graph_query`/`graph_path`/`graph_neighbors`/`graph_rationale`）| `test_tools.py:131-134` **只断言工具名存在**，不验证输出 |

`docs/GRAPH_EXPLORER.md:44-46` 提到的 `test_graph_relationships.py` 覆盖"252 个邻点"，与 `relationships.py:14` 的 `_MAX_EVIDENCE_CHARS = 180_000` 对应，这块是有保障的。

---

## 6. 对"把 CodeSlice 包成 DSH 插件"的评估

### 6.1 现成的、可以直接暴露的 Tool（几乎零改造）

`graph/service.py` **本来就已经是给 Agent 用的门面**（`service.py:1-12` 自述"convenience entry point for the agent's graph tools"），而 `agent/tools.py:325-354` 已经把它封成了 4 个 LangChain `@tool`。**DSH 侧要做的不是重写，是翻译**：把 `@tool` 装饰器换成 DSH 的 tool schema，把 `run_tool` 的 if-else 分发（`tools.py:309-371`）换成注册表。

| 现有 Tool（`tools.py:259-276`） | Service 入口 | 可移植性 | 备注 |
|---|---|---|---|
| `graph_query(question, mode, depth, token_budget)` | `service.context_for_question` | ⭐⭐⭐⭐⭐ 直接可用 | `query.py` 纯 dict 无 DB，最干净 |
| `graph_path(source, target, max_hops)` | `service.path_between` | ⭐⭐⭐⭐⭐ | 逐跳 + 最弱置信度，输出已是给 LLM 读的文本 |
| `graph_neighbors(label, relation_filter)` | `service.neighbors` | ⭐⭐⭐⭐⭐ | |
| `graph_rationale(label)` | `service.rationale_for` | ⭐⭐⭐⭐⭐ | "为什么这么写"取自 docstring/`# WHY:`，可引用为事实 |

**这四个的价值在于它们返回的是"已渲染的文本 + token 预算"**，而不是原始图数据 —— 这恰好是 Tool 该有的形状。`CHARS_PER_TOKEN=4`（`query.py:36`）和预算截断（`query.py:344-350`）已经在替 Agent 省 context。

### 6.2 需要薄封装即可暴露的（value 很高、但当前没有 Tool）

| 能力 | 现有入口 | 改造量 | 为什么值得 |
|---|---|---|---|
| **go-to-definition / find-references** | `navigation.py:211-274` → `symbols.py` | 小：抽 service 层函数，绕开 FastAPI `Query` | 这是 Agent"读代码"最刚需的动作，目前 Agent 只有 `search_code` 靠猜 |
| **hover（签名+docstring）** | `navigation.py:277-309` | 小 | 廉价、高信噪比的上下文注入 |
| **符号搜索** | `symbols.search_definitions`（`symbols.py:246`）| 极小 | 当前 API 已存在但前端未用（`navigation.py:319` 自称"未来"）|
| **`graph/locate`（位置→节点）** | `graph_code.py:221-271` `_location_node` | 小 | 把"文件第 120 行"变成图节点，是连接文件读取与图谱的关键一跳 |
| **hybrid search** | `hybrid.search` | 小 | 已是纯函数式入口 |

### 6.3 必须重写的部分

| 部分 | 原因 |
|---|---|
| **持久化层**（`store.py` 全部）| 强耦合 `app.core.db` 的 `get_conn`/`write_conn`/`graphs` 表/`settings` epoch。DSH 侧要么自带 storage，要么改成可注入的 repository 接口 |
| **HTTP 层**（`graph_code.py` 全部）| FastAPI + `TokenDep` + `ProjectDep`，DSH 插件不需要 HTTP，直接调 service |
| **索引器**（`indexer.py`）| 强耦合 `jobs` 表、`watchfiles`、`app.models.embeddings`、`app.storage.repo`。且它做的是"整个项目索引"，DSH 的语义更接近"按需读取当前工作区" |
| **embedding 配置**（`embeddings.py`）| 绑死 `model_config.build_embeddings()`；DSH 有自己的模型/凭证体系 |
| **聚类**（`cluster.py`）| 依赖 `networkx`；而且**图谱查询/工具完全不需要社区**（`query.py` 只在渲染时读 `community_label`，`query.py:334-336`）。集成时可以整块跳过，省掉一个依赖和一个 O(V·E) 步骤 |
| **`relationships.py`** | 内部调 `build_chat_model` 做一次无工具模型调用。DSH 应该由 Agent 自己总结，而不是插件内再调一次模型（否则 = 嵌套模型调用、双倍 token、不可观测）|

### 6.4 结论：「独立服务 + 工具薄封装」还是「工具集直连」？

**推荐：独立进程/独立包 + 工具薄封装（进程内直连，不走 HTTP）。**

理由按重要性排序：

1. **`query.py` 是纯函数、`resolve.py` 是纯函数、`engine.py` 是纯函数**（第 1.3 节的分层）。这意味着"图谱构建"可以在任意进程里跑，不需要服务常驻。把 service 层抽成 `codeslice_graph` 独立 Python 包，DSH 插件 `import` 它即可 —— **不需要 HTTP，也就没有端口、鉴权、生命周期问题**。
2. **但构建是重的**（全量 AST + 全量 resolve + Louvain，5.1 P0）。如果直接塞进 DSH 插件的 tool call 里同步跑，会阻塞 Agent 的一次工具调用数秒到数十秒。所以构建必须**出进程**：要么后台 job（复用 `indexer.py:358-389` 的 daemon thread + `jobs` 轮询模式），要么一个真正的 sidecar 服务。
3. **只读查询应该进进程**：`query.py` 只需要一个 `graph: dict`。一旦图被加载/缓存，`context_for_question` / `path_between` / `neighbors` / `rationale_for` 全是纯计算，延迟在毫秒级，包成 Tool 完全没问题。
4. **"独立服务"的收益主要在构建侧**（增量、后台、多项目并发、避免 DSH 主进程内存被大图占满）。直接套 HTTP 会继承本仓所有 §5.1 的性能债务，而且 `GET /graph` 那种"一次吐 1-2MB 全图"的接口对 Agent 毫无用处（Agent 要的是 §6.1 那四个已渲染好的文本）。
5. **必须重写的边界很清楚**：storage + embedding + HTTP 三块换掉，解析/消解/查询三块几乎原样搬。

**一句话**：把 `ast/` + `query.py` 原样抽成库，`store.py` 换成 DSH 的存储抽象，构建走后台 job，对外只暴露 §6.1 + §6.2 那 9 个 Tool；**不要**把 FastAPI 服务整体搬过来，**也不要**把 `relationships.py` 的模型调用带进插件。

### 6.5 接入前建议先修的 4 件事（与本报告 §5 对应）

1. `store.build_and_store` 改成单次 `resolve(with_index=True)`（P0，省一半构建时间）。
2. `SqliteVectorStore` 换 numpy 或预归一化（P1，查询快一个数量级）。
3. 补 JS/TS 的 `superclass_field`（C1，能力缺口）。
4. 给 `query.py` 和 `cluster.py` 补单测（5.4，这两个模块是 Agent 工具的直接依赖却零覆盖）。

---

## 附录 A：本次审计的"未确认"清单

| 项 | 为什么未确认 |
|---|---|
| `tree_sitter` / `tree_sitter_*` 实际版本与 ABI | 未读 lock/requirements 全文 |
| `POST /graph/summary`（非流式）是否仍有调用方 | 前端 `api.ts` 只定义了流式版本，可能被旧版前端或脚本使用 |
| `GET /graph/node` 的组件调用方 | grep 找到 `api.ts:281` 定义但未找到组件 import |
| `POST /{pid}/index` 的组件调用方 | `api.ts:200` 有定义，组件层未找到调用（可能由项目生命周期事件触发，见 `indexing.py:22` 注释）|
| `GET /symbols` 是否被任何非 React 客户端使用 | 后端注释称"未来 Ctrl-Ctrl+T 面板"|
| 实际大仓性能数字 | 本次为静态审计，未执行任何构建 |

## 附录 B：关键常量速查

```
SCHEMA_VERSION          = 5          graph/__init__.py:22
TOKEN_VERSION           = 1          graph/store.py:89
MAX_FILE_BYTES          = 1_500_000  graph/builder.py:45  / indexing/indexer.py:32
CHUNK_FORMAT_VERSION    = 2          indexing/indexer.py:33
MAX_RATIONALE_CHARS     = 400        graph/ast/engine.py:48
MIN_COMMUNITY_SIZE      = 2          graph/cluster.py:23
POOLED_LABEL            = "未分类"    graph/cluster.py:28
DEFAULT_DEPTH           = 3          graph/query.py:29
MAX_DEPTH               = 6          graph/query.py:31
DEFAULT_TOKEN_BUDGET    = 2000       graph/query.py:30
CHARS_PER_TOKEN         = 4          graph/query.py:36
MAX_LAYOUT_BYTES        = 8 MiB      graph/store.py:100
MAX_LAYOUT_POSITIONS    = 50_000     graph/store.py:101
_MAX_EVIDENCE_CHARS     = 180_000    graph/relationships.py:14
NOTES_SCHEMA_VERSION    = 2          graph/notes.py:36
FALLBACK_LINES          = 60         indexing/chunker.py:23
MAX_CHUNK_LINES         = 220        indexing/chunker.py:24
MAX_CHUNK_CHARS         = 8000       indexing/chunker.py:25
RRF_K                   = 60         retrieval/hybrid.py:17
MAX_QUERY_TOKENS        = 24         retrieval/tokenize.py:18
INDEX_VERSION           = 2          retrieval/tokenize.py:21
MAX_EMBED_CHARS         = 6000       models/embeddings.py:25
MAX_REFERENCES          = 500        api/navigation.py:28
MAX_CANDIDATES          = 12         api/navigation.py:29
```
