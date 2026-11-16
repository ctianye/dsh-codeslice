/**
 * Copy for the CodeSlice graph view (Agent C, §2.2).
 *
 * Self-contained `gr.*` namespace so this module's keys cannot collide with
 * the core dictionary; E merges this through `mergeDict(ctx, GRAPH_LOCALE)`.
 * `zh` and `en` carry exactly the same key set.
 */

export const GRAPH_LOCALE = {
  zh: {
    /* ---- stats ---------------------------------------------------- */
    'gr.stats.nodes': '可见节点',
    'gr.stats.edges': '关系',
    'gr.stats.communities': '社区',

    /* ---- family switch bar ----------------------------------------- */
    'gr.family.behaviour': '调用',
    'gr.family.dependency': '依赖',
    'gr.family.structure': '结构',
    'gr.family.hierarchy': '继承',
    'gr.family.meaning': '说明',
    'gr.family.other': '其他',
    'gr.family.hint.behaviour': '显示调用与被调用关系',
    'gr.family.hint.dependency': '显示导入、外部依赖与继承关系',
    'gr.family.hint.structure': '显示包含与方法归属；关闭后画面更像调用图',
    'gr.family.hint.hierarchy': '显示继承与实现关系',
    'gr.family.hint.meaning': '显示文档字符串和注释说明节点',
    'gr.family.hint.other': '显示其他关系',

    /* ---- legend / communities -------------------------------------- */
    'gr.legend.title': '社区',
    'gr.legend.empty': '还没有社区。',
    'gr.legend.hint': '颜色代表社区；点击社区聚焦整组并定位到它的核心节点，点击节点查看调用者与被调用者，双击节点直接打开代码。',
    'gr.legend.hintNotes': '颜色代表社区；点击社区聚焦整组并定位到它的核心节点，点击笔记查看它关联的主题与相似笔记，双击笔记直接打开笔记。',

    /* ---- inspector ------------------------------------------------- */
    'gr.inspector.idle': '点击图谱里的一个节点，这里显示它的调用者、被调用者与说明。',
    'gr.inspector.back': '全部社区',
    'gr.rail.show': '详情',
    'gr.rail.hide': '收起详情',
    'gr.inspector.open': '打开代码',
    'gr.inspector.ask': '就此提问',
    'gr.inspector.neighbours': '{count} 邻点',
    'gr.inspector.noRelations': '此节点没有直接关联。',
    'gr.inspector.signature': '签名',
    'gr.inspector.siblings': '同文件中的其他声明',

    /* ---- relation groups ------------------------------------------- */
    'gr.group.callers': '调用者',
    'gr.group.calls': '调用',
    'gr.group.dependencies': '依赖',
    'gr.group.structure': '结构',
    'gr.group.meaning': '说明',
    'gr.group.hierarchy': '继承',
    'gr.group.related': '关联',
    'gr.rows.more': '还有 {count} 个关系；用搜索定位更具体。',

    /* ---- canvas ---------------------------------------------------- */
    'gr.canvas.hint': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开代码',
    'gr.canvas.hintNotes': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开笔记',
    'gr.canvas.laying': '正在排布图谱…',
    'gr.canvas.loading': '正在加载图谱…',
    'gr.canvas.error': '图谱加载失败',
    'gr.canvas.emptyTitle': '还没有代码图谱',
    'gr.canvas.emptyBody': '工作区里没有可索引的符号，重建一次试试。',
    'gr.canvas.emptyFiltered': '当前筛选下没有可显示的节点。',
    'gr.tool.fit': '适应窗口',
    'gr.tool.zoomIn': '放大',
    'gr.tool.zoomOut': '缩小',
    'gr.truncated': '图谱已截断：只画了 {shown} / {total} 个节点',

    /* ---- scope banner ---------------------------------------------- */
    'gr.scope.session': '会话关联节点',
    'gr.scope.all': '全图：当前会话暂无可定位的节点，展示整个工作区。',

    /* ---- search ----------------------------------------------------- */
    'gr.search.placeholder': '搜索函数 / 文件 / 社区',
    'gr.search.placeholderNotes': '搜索笔记 / 主题 / 社区',
    'gr.search.empty': '没有匹配的节点。',
  },

  en: {
    /* ---- stats ---------------------------------------------------- */
    'gr.stats.nodes': 'Visible nodes',
    'gr.stats.edges': 'Relations',
    'gr.stats.communities': 'Communities',

    /* ---- family switch bar ----------------------------------------- */
    'gr.family.behaviour': 'Calls',
    'gr.family.dependency': 'Dependency',
    'gr.family.structure': 'Structure',
    'gr.family.hierarchy': 'Hierarchy',
    'gr.family.meaning': 'Meaning',
    'gr.family.other': 'Other',
    'gr.family.hint.behaviour': 'Show call and caller relations',
    'gr.family.hint.dependency': 'Show imports, external deps and inheritance',
    'gr.family.hint.structure': 'Show containment and method ownership; closer to a call graph when off',
    'gr.family.hint.hierarchy': 'Show inheritance and implementation',
    'gr.family.hint.meaning': 'Show docstring and comment rationale nodes',
    'gr.family.hint.other': 'Show remaining relations',

    /* ---- legend / communities -------------------------------------- */
    'gr.legend.title': 'Communities',
    'gr.legend.empty': 'No communities yet.',
    'gr.legend.hint': 'Colour marks a community; click a community to focus and centre its members, click a node to see its callers and calls. Double-click to open the code.',
    'gr.legend.hintNotes': 'Colour marks a community; click a community to focus and centre its members, click a note to see its topics and similar notes. Double-click to open the note.',

    /* ---- inspector ------------------------------------------------- */
    'gr.inspector.idle': 'Pick a node in the graph to see its callers, calls and rationale.',
    'gr.inspector.back': 'All communities',
    'gr.rail.show': 'Details',
    'gr.rail.hide': 'Hide details',
    'gr.inspector.open': 'Open code',
    'gr.inspector.ask': 'Ask about this',
    'gr.inspector.neighbours': '{count} neighbours',
    'gr.inspector.noRelations': 'This node has no direct relations.',
    'gr.inspector.signature': 'Signature',
    'gr.inspector.siblings': 'Other declarations in this file',

    /* ---- relation groups ------------------------------------------- */
    'gr.group.callers': 'Callers',
    'gr.group.calls': 'Calls',
    'gr.group.dependencies': 'Dependencies',
    'gr.group.structure': 'Structure',
    'gr.group.meaning': 'Explains',
    'gr.group.hierarchy': 'Extends',
    'gr.group.related': 'Related',
    'gr.rows.more': '{count} more relations; use search to narrow down.',

    /* ---- canvas ---------------------------------------------------- */
    'gr.canvas.hint': 'Wheel zooms · drag pans · click inspects · double-click opens code',
    'gr.canvas.hintNotes': 'Wheel zooms · drag pans · click inspects · double-click opens the note',
    'gr.canvas.laying': 'Laying out the graph…',
    'gr.canvas.loading': 'Loading graph…',
    'gr.canvas.error': 'Could not load the graph',
    'gr.canvas.emptyTitle': 'No code graph yet',
    'gr.canvas.emptyBody': 'Nothing in this workspace could be indexed. Try rebuilding.',
    'gr.canvas.emptyFiltered': 'No nodes are visible under the current filters.',
    'gr.tool.fit': 'Fit to canvas',
    'gr.tool.zoomIn': 'Zoom in',
    'gr.tool.zoomOut': 'Zoom out',
    'gr.truncated': 'Graph truncated: drawing {shown} of {total} nodes',

    /* ---- scope banner ---------------------------------------------- */
    'gr.scope.session': 'Session-related nodes',
    'gr.scope.all': 'Whole graph: no locatable node for this session; showing the workspace.',

    /* ---- search ----------------------------------------------------- */
    'gr.search.placeholder': 'Find a function / file / community',
    'gr.search.placeholderNotes': 'Find a note / topic / community',
    'gr.search.empty': 'No matching node.',
  },
};
