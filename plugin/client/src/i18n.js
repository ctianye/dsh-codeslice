/**
 * Copy for the browser half.
 *
 * Two complete tables, not one table plus fallbacks: a half-translated panel is
 * worse than an untranslated one, because mixed script signals "this string has
 * no owner" and readers stop trusting the labels. `zh` and `en` therefore carry
 * exactly the same key set, and the build of this file is the only place a new
 * key may be introduced.
 *
 * The host owns the language preference. This module asks the locale service
 * first and only falls back to its own table, which is also what has to answer
 * before the service reports anything (a plugin can be applied before the
 * locale service is up), hence the `<html lang>` probe.
 */

export const DICT = {
  zh: {
    /* ---- tabs ------------------------------------------------------- */
    'tab.workbench': '阅读工作台',
    'tab.workbench.desc': '对话、代码与图谱三合一：提问、选中代码、看图',
    'tab.graph': '代码图谱',
    'tab.graph.desc': '调用、继承与说明的图谱，和对话同屏',
    'tab.notes': '知识库',
    'tab.notes.desc': '带代码锚点与漂移检测的知识库',
    'tab.outline': '文件大纲',
    'tab.outline.desc': '一个文件的声明、导入与说明',
    'tab.annotated': 'CodeSlice 批注视图',
    'tab.annotated.desc': '只读代码，叠加上行内批注与锚点状态',

    /* ---- common ----------------------------------------------------- */
    'common.close': '关闭',
    'common.back': '返回',
    'common.retry': '重试',
    'common.loading': '正在加载…',
    'common.error': '加载失败',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.save': '保存',
    'common.saving': '保存中…',
    'common.cancel': '取消',
    'common.create': '新建',
    'common.refresh': '刷新',
    'common.open': '打开',
    'common.none': '无',
    'common.untitled': '无标题',
    'common.confirm': '确认',
    'common.more': '更多',
    'common.lines': '行',
    'common.symbols': '符号',
    'common.truncated': '已截断',
    'common.updated': '更新于 {time}',
    'common.copy': '复制',
    'common.copied': '已复制',

    /* ---- graph: toolbar --------------------------------------------- */
    'graph.scope.workspace': '工作区',
    'graph.scope.file': '文件',
    'graph.scope.focus': '聚焦',
    'graph.scope.hint.file': '先选中一个节点或文件，才能按文件看',
    'graph.scope.hint.focus': '先选中一个节点，才能聚焦它的一跳邻域',
    'graph.action.refresh': '刷新',
    'graph.action.rebuild': '重建索引',
    'graph.action.rebuild.hint': '从头扫描工作区并重建图谱',
    'graph.action.fit': '适应画布',
    'graph.status.summary': '{nodes} 节点 · {edges} 关系 · {communities} 社区',
    'graph.status.built': '{files} 文件 · {lines} 行 · 构建 {buildMs} ms',
    'graph.status.cached': '缓存命中',
    'graph.status.rebuilt': '已重建',
    'graph.status.truncated': '图谱已截断：只画了 {shown} / {total} 个节点',
    'graph.status.aggregated': '聚合视图：{communities} 个社区 / 共 {total} 个节点',
    'graph.status.aggregatedTitle': '节点超过上限，已按社区聚合；点击社区可查看名称',
    'graph.loading': '正在加载图谱…',
    'graph.laying': '正在排布图谱…',
    'graph.error.title': '图谱加载失败',
    'graph.empty.title': '还没有代码图谱',
    'graph.empty.body': '工作区里没有可索引的符号，重建一次试试。',
    'graph.empty.filtered': '当前筛选下没有可显示的节点。',
    'graph.zoom.in': '放大',
    'graph.zoom.out': '缩小',
    'graph.canvas.hint': '滚轮缩放 · 拖拽平移 · 单击查看 · 双击打开代码',
    'graph.canvas.nodes': '{shown} / {total} 节点',

    /* ---- graph: legend / filters ------------------------------------ */
    'graph.legend.title': '关系类别',
    'family.behaviour': '行为',
    'family.dependency': '依赖',
    'family.structure': '结构',
    'family.hierarchy': '继承',
    'family.meaning': '说明',
    'family.other': '其他',

    /* ---- graph: search ---------------------------------------------- */
    'graph.search.placeholder': '搜索函数 / 文件 / 社区',
    'graph.search.empty': '没有匹配的节点。',
    'graph.search.hint': '↑ ↓ 选择 · Enter 定位 · Esc 清空',
    'graph.search.clear': '清空搜索',
    'graph.search.count': '{count} 项',

    /* ---- graph: inspector ------------------------------------------- */
    'graph.inspector.idle': '点击图谱里的一个节点，这里显示它的调用者、被调用者与说明。',
    'graph.inspector.back': '全部社区',
    'graph.inspector.open': '打开代码',
    'graph.inspector.ask': '就此提问',
    'graph.inspector.askHint': '把这个问题送进旁边的对话，并带上该节点的图谱邻域',
    'graph.inspector.rationale': '说明',
    'graph.inspector.siblings': '同文件中的其他声明',
    'graph.inspector.neighbours': '{count} 邻点',
    'graph.inspector.context': '上下文',
    'graph.rows.more': '还有 {count} 个关系；用搜索定位更具体。',
    'graph.group.callers': '调用者',
    'graph.group.calls': '调用',
    'graph.group.dependencies': '依赖',
    'graph.group.structure': '结构',
    'graph.group.meaning': '说明',
    'graph.group.hierarchy': '继承',
    'graph.group.related': '关联',

    /* ---- graph: communities ----------------------------------------- */
    'graph.communities.title': '社区',
    'graph.communities.hideAll': '全部隐藏',
    'graph.communities.showAll': '全部显示',
    'graph.communities.none': '还没有社区。',
    'graph.communities.unnamed': '社区 {id}',

    /* ---- graph: tooltip --------------------------------------------- */
    'graph.tooltip.community': '社区：{label}',
    'graph.tooltip.connections': '连接：{degree}',
    'graph.tooltip.line': '第 {line} 行',

    /* ---- composer chip ---------------------------------------------- */
    'chip.label': 'CodeSlice',
    'chip.hint': '打开 CodeSlice 图谱',
    'chip.selection': '选中 {path}:{line}',
    'chip.selectionRange': '选中 {path}:{start}-{end}',
    'chip.copy': '复制引用',
    'chip.failed': 'CodeSlice 不可用',

    /* ---- notes ------------------------------------------------------ */
    'notes.title': '知识库',
    'notes.newNote': '新建笔记',
    'notes.newFolder': '新建文件夹',
    'notes.search': '搜索标题或内容',
    'notes.empty': '这个工作区还没有笔记。',
    'notes.emptySearch': '没有匹配的笔记。',
    'notes.clearSearch': '清除搜索',
    'notes.root': '全部笔记',
    'notes.library': '知识库',
    'notes.more': '更多操作',
    'notes.count': '{count} 条',
    'notes.folder.name': '文件夹名称',
    'notes.folder.create': '创建',
    'notes.folder.empty': '空文件夹',
    'notes.folder.delete': '删除文件夹',
    'notes.folder.deleteConfirm': '删除这个文件夹？里面的笔记会回到未分类。',
    'notes.folder.rename': '重命名文件夹',
    'notes.folder.toggle': '展开或收起文件夹',
    'notes.folder.created': '已创建文件夹「{name}」',
    'notes.folder.renamed': '已重命名文件夹',
    'notes.folder.deleted': '已删除文件夹，{count} 篇笔记移到上一层',
    'notes.folder.unfiled': '未分类',
    'notes.move': '移动到',
    'notes.move.title': '移动到文件夹',
    'notes.move.hint': '选择目标文件夹',
    'notes.move.moved': '已移动笔记',
    'notes.menu.open': '打开笔记',
    'notes.list.empty': '这个文件夹里还没有笔记。',
    'notes.create.title': '标题',
    'notes.create.body': '内容（Markdown）',
    'notes.create.placeholder.title': '一句话说清这个知识点',
    'notes.create.placeholder.body': '## 知识点\n…\n\n## 关联代码\n### path:line',
    'notes.create.save': '保存笔记',
    'notes.reader.edit': '编辑',
    'notes.reader.save': '保存',
    'notes.reader.cancel': '取消',
    'notes.reader.delete': '删除笔记',
    'notes.reader.deleteConfirm': '删除这条笔记？',
    'notes.reader.export': '导出',
    'notes.reader.exported': '已导出到 {path}',
    'notes.back': '返回笔记列表',
    'notes.import': '导入',
    'notes.importPick': '选择 .md 文件',
    'notes.importPath': '或粘贴文件路径（可换行多条）',
    'notes.importRun': '导入',
    'notes.importEmpty': '没有读到 Markdown 内容。',
    'notes.imported': '已导入 {count} 篇笔记',
    'notes.select': '选中这条笔记',
    'notes.selected': '已选 {count} 篇',
    'notes.cancelSelect': '取消选择',
    'notes.exportSelected': '导出选中',
    'notes.export': '导出',
    'notes.exportAll': '全部导出',
    'notes.exportedMany': '已导出 {count} 篇到 {path}',
    'notes.reader.refs': '代码引用',
    'notes.reader.anchors': '锚点',
    'notes.reader.updated': '更新于 {time}',
    'notes.reader.bodyEmpty': '这条笔记还没有正文。',
    'notes.drift.fresh': '有效',
    'notes.drift.moved': '已移动',
    'notes.drift.drifted': '已漂移',
    'notes.drift.missing': '已失效',
    'notes.error.title': '笔记操作失败',

    /* ---- outline ---------------------------------------------------- */
    'outline.search': '按路径筛选文件',
    'outline.pick': '选择一个文件',
    'outline.declarations': '声明',
    'outline.imports': '导入',
    'outline.importedBy': '被导入',
    'outline.rationale': '说明',
    'outline.empty': '这个文件里没有声明。',
    'outline.notFound': '这个文件不在索引里。',
    'outline.hint': '点击一行在编辑器中打开',
    'outline.count': '{count} 项',
    'outline.loading': '正在读取大纲…',

    /* ---- annotated -------------------------------------------------- */
    'annotated.large.title': '这个文件太大，无法在此预览',
    'annotated.large.body': '文件大小 {size}，超过批注视图的上限。请在编辑器里打开它。',
    'annotated.annotation.new': '批注',
    'annotated.annotation.title': '批注标题',
    'annotated.annotation.body': '批注内容',
    'annotated.annotation.save': '保存批注',
    'annotated.annotation.delete': '删除批注',
    'annotated.annotation.empty': '这个文件还没有批注。',
    'annotated.annotation.hint': '点行号选起点，再点一次选终点，然后写批注。',
    'annotated.annotation.selected': '已选第 {start}-{end} 行',
    'annotated.annotation.none': '这一行没有批注。',
    'annotated.loading': '正在加载批注…',
  },

  en: {
    /* ---- tabs ------------------------------------------------------- */
    'tab.workbench': 'Reading workbench',
    'tab.workbench.desc': 'Ask, select code and read the graph in one pane',
    'tab.graph': 'Code graph',
    'tab.graph.desc': 'Calls, inheritance and rationale, beside the conversation',
    'tab.notes': 'Knowledge base',
    'tab.notes.desc': 'A note knowledge base with code anchors and drift detection',
    'tab.outline': 'Outline',
    'tab.outline.desc': 'Declarations, imports and rationale for one file',
    'tab.annotated': 'CodeSlice annotations',
    'tab.annotated.desc': 'Read-only code with inline annotations and anchor status',

    /* ---- common ----------------------------------------------------- */
    'common.close': 'Close',
    'common.back': 'Back',
    'common.retry': 'Retry',
    'common.loading': 'Loading…',
    'common.error': 'Could not load',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.cancel': 'Cancel',
    'common.create': 'Create',
    'common.refresh': 'Refresh',
    'common.open': 'Open',
    'common.none': 'None',
    'common.untitled': 'Untitled',
    'common.confirm': 'Confirm',
    'common.more': 'More',
    'common.lines': 'lines',
    'common.symbols': 'symbols',
    'common.truncated': 'truncated',
    'common.updated': 'updated {time}',
    'common.copy': 'Copy',
    'common.copied': 'Copied',

    /* ---- graph: toolbar --------------------------------------------- */
    'graph.scope.workspace': 'Workspace',
    'graph.scope.file': 'File',
    'graph.scope.focus': 'Focus',
    'graph.scope.hint.file': 'Select a node or file first to view by file',
    'graph.scope.hint.focus': 'Select a node first to focus its one-hop neighbourhood',
    'graph.action.refresh': 'Refresh',
    'graph.action.rebuild': 'Rebuild index',
    'graph.action.rebuild.hint': 'Rescan the workspace and rebuild the graph',
    'graph.action.fit': 'Fit to canvas',
    'graph.status.summary': '{nodes} nodes · {edges} relations · {communities} communities',
    'graph.status.built': '{files} files · {lines} lines · built in {buildMs} ms',
    'graph.status.cached': 'cached',
    'graph.status.rebuilt': 'rebuilt',
    'graph.status.truncated': 'Graph truncated: drawing {shown} of {total} nodes',
    'graph.status.aggregated': 'Aggregated view: {communities} communities of {total} nodes',
    'graph.status.aggregatedTitle': 'Above the node budget; one node per community',
    'graph.loading': 'Loading graph…',
    'graph.laying': 'Laying out the graph…',
    'graph.error.title': 'Could not load the graph',
    'graph.empty.title': 'No code graph yet',
    'graph.empty.body': 'Nothing in this workspace could be indexed. Try rebuilding.',
    'graph.empty.filtered': 'No nodes are visible under the current filters.',
    'graph.zoom.in': 'Zoom in',
    'graph.zoom.out': 'Zoom out',
    'graph.canvas.hint': 'Wheel zooms · drag pans · click inspects · double-click opens code',
    'graph.canvas.nodes': '{shown} / {total} nodes',

    /* ---- graph: legend / filters ------------------------------------ */
    'graph.legend.title': 'Relation families',
    'family.behaviour': 'Behaviour',
    'family.dependency': 'Dependency',
    'family.structure': 'Structure',
    'family.hierarchy': 'Hierarchy',
    'family.meaning': 'Meaning',
    'family.other': 'Other',

    /* ---- graph: search ---------------------------------------------- */
    'graph.search.placeholder': 'Find a function / file / community',
    'graph.search.empty': 'No matching node.',
    'graph.search.hint': '↑ ↓ to move · Enter to centre · Esc to clear',
    'graph.search.clear': 'Clear the search',
    'graph.search.count': '{count} hits',

    /* ---- graph: inspector ------------------------------------------- */
    'graph.inspector.idle': 'Pick a node in the graph to see its callers, calls and rationale.',
    'graph.inspector.back': 'All communities',
    'graph.inspector.open': 'Open code',
    'graph.inspector.ask': 'Ask about this',
    'graph.inspector.askHint': 'Send this question to the conversation, with the node\'s graph neighbourhood',
    'graph.inspector.rationale': 'Rationale',
    'graph.inspector.siblings': 'Also in this file',
    'graph.inspector.neighbours': '{count} neighbours',
    'graph.inspector.context': 'Context',
    'graph.rows.more': '{count} more relations; use search to narrow down.',
    'graph.group.callers': 'Callers',
    'graph.group.calls': 'Calls',
    'graph.group.dependencies': 'Dependencies',
    'graph.group.structure': 'Structure',
    'graph.group.meaning': 'Explains',
    'graph.group.hierarchy': 'Extends',
    'graph.group.related': 'Related',

    /* ---- graph: communities ----------------------------------------- */
    'graph.communities.title': 'Communities',
    'graph.communities.hideAll': 'Hide all',
    'graph.communities.showAll': 'Show all',
    'graph.communities.none': 'No communities yet.',
    'graph.communities.unnamed': 'Community {id}',

    /* ---- graph: tooltip --------------------------------------------- */
    'graph.tooltip.community': 'Community: {label}',
    'graph.tooltip.connections': 'Connections: {degree}',
    'graph.tooltip.line': 'line {line}',

    /* ---- composer chip ---------------------------------------------- */
    'chip.label': 'CodeSlice',
    'chip.hint': 'Open the CodeSlice graph',
    'chip.selection': 'Selected {path}:{line}',
    'chip.selectionRange': 'Selected {path}:{start}-{end}',
    'chip.copy': 'Copy citation',
    'chip.failed': 'CodeSlice unavailable',

    /* ---- notes ------------------------------------------------------ */
    'notes.title': 'Knowledge base',
    'notes.newNote': 'New note',
    'notes.newFolder': 'New folder',
    'notes.search': 'Search titles and content',
    'notes.empty': 'This workspace has no notes yet.',
    'notes.emptySearch': 'No matching note.',
    'notes.clearSearch': 'Clear the search',
    'notes.root': 'All notes',
    'notes.library': 'Knowledge base',
    'notes.more': 'More actions',
    'notes.count': '{count}',
    'notes.folder.name': 'Folder name',
    'notes.folder.create': 'Create',
    'notes.folder.empty': 'Empty folder',
    'notes.folder.delete': 'Delete folder',
    'notes.folder.deleteConfirm': 'Delete this folder? Its notes move to unfiled.',
    'notes.folder.rename': 'Rename folder',
    'notes.folder.toggle': 'Expand or collapse folder',
    'notes.folder.created': 'Folder “{name}” created',
    'notes.folder.renamed': 'Folder renamed',
    'notes.folder.deleted': 'Folder deleted, {count} note(s) moved up one level',
    'notes.folder.unfiled': 'Unfiled',
    'notes.move': 'Move to',
    'notes.move.title': 'Move to folder',
    'notes.move.hint': 'Choose a destination folder',
    'notes.move.moved': 'Note moved',
    'notes.menu.open': 'Open note',
    'notes.list.empty': 'No notes in this folder yet.',
    'notes.create.title': 'Title',
    'notes.create.body': 'Body (Markdown)',
    'notes.create.placeholder.title': 'One line that states the point',
    'notes.create.placeholder.body': '## 知识点\n…\n\n## 关联代码\n### path:line',
    'notes.create.save': 'Save note',
    'notes.reader.edit': 'Edit',
    'notes.reader.save': 'Save',
    'notes.reader.cancel': 'Cancel',
    'notes.reader.delete': 'Delete note',
    'notes.reader.deleteConfirm': 'Delete this note?',
    'notes.reader.export': 'Export',
    'notes.reader.exported': 'Exported to {path}',
    'notes.back': 'Back to note list',
    'notes.import': 'Import',
    'notes.importPick': 'Choose .md files',
    'notes.importPath': 'or paste a file path (one per line)',
    'notes.importRun': 'Import',
    'notes.importEmpty': 'No Markdown content was read.',
    'notes.imported': 'Imported {count} note(s)',
    'notes.select': 'Select this note',
    'notes.selected': '{count} selected',
    'notes.cancelSelect': 'Clear selection',
    'notes.exportSelected': 'Export selected',
    'notes.export': 'Export',
    'notes.exportAll': 'Export all',
    'notes.exportedMany': 'Exported {count} note(s) to {path}',
    'notes.reader.refs': 'Code references',
    'notes.reader.anchors': 'Anchors',
    'notes.reader.updated': 'updated {time}',
    'notes.reader.bodyEmpty': 'This note has no body yet.',
    'notes.drift.fresh': 'fresh',
    'notes.drift.moved': 'moved',
    'notes.drift.drifted': 'drifted',
    'notes.drift.missing': 'missing',
    'notes.error.title': 'Note operation failed',

    /* ---- outline ---------------------------------------------------- */
    'outline.search': 'Filter files by path',
    'outline.pick': 'Pick a file',
    'outline.declarations': 'Declarations',
    'outline.imports': 'Imports',
    'outline.importedBy': 'Imported by',
    'outline.rationale': 'Rationale',
    'outline.empty': 'This file has no declarations.',
    'outline.notFound': 'This file is not in the index.',
    'outline.hint': 'Click a row to open it in the editor',
    'outline.count': '{count}',
    'outline.loading': 'Reading the outline…',

    /* ---- annotated -------------------------------------------------- */
    'annotated.large.title': 'This file is too large to preview here',
    'annotated.large.body': 'The file is {size}, over the annotation view limit. Open it in the editor instead.',
    'annotated.annotation.new': 'Annotate',
    'annotated.annotation.title': 'Annotation title',
    'annotated.annotation.body': 'Annotation body',
    'annotated.annotation.save': 'Save annotation',
    'annotated.annotation.delete': 'Delete annotation',
    'annotated.annotation.empty': 'No annotations on this file yet.',
    'annotated.annotation.hint': 'Click a line number for the start, again for the end, then write.',
    'annotated.annotation.selected': 'Lines {start}-{end} selected',
    'annotated.annotation.none': 'No annotation on this line.',
    'annotated.loading': 'Loading annotations…',
  },
};

/**
 * Merge one or more extra tables into the dictionary.
 *
 * The workbench's copy lives in its own modules (`i18n-chat.js`,
 * `i18n-workbench.js`) and calls this at load time. Splitting the table is not
 * cosmetic: `DICT` is one object literal, so two authors adding keys to it in
 * parallel would conflict on every edit, and a half-merged table would ship a
 * key that reads as its own name.
 *
 * A later table wins over an earlier one for the same key, and every table must
 * carry both languages — the completeness check below is what keeps a
 * half-translated panel from reaching a reader.
 *
 * @param extra - `{ zh: {...}, en: {...} }`.
 * @throws when a table is missing a language or a key exists in only one.
 */
export function mergeDict(extra) {
  for (const locale of ['zh', 'en']) {
    const rows = extra?.[locale];
    if (rows === undefined || rows === null) {
      throw new Error(`codeslice: merged dictionary is missing the "${locale}" table`);
    }
    for (const [key, value] of Object.entries(rows)) {
      if (typeof value !== 'string') {
        throw new Error(`codeslice: dictionary key "${key}" (${locale}) is not a string`);
      }
      // A key present in one language and absent in the other renders as the raw
      // key for exactly the readers of that language, which is the failure this
      // check exists to make impossible to ship.
      const hasZh = Object.hasOwn(extra.zh ?? {}, key);
      const hasEn = Object.hasOwn(extra.en ?? {}, key);
      if (hasZh !== hasEn) {
        throw new Error(`codeslice: dictionary key "${key}" exists in only one language`);
      }
    }
    DICT[locale] = { ...DICT[locale], ...rows };
  }
}

/**
 * Ask the host which language is active, without trusting any single source.
 *
 * Order: the locale service's active id → the document's `lang` → the browser's
 * preferred language. Any failure falls through, because a thrown error here
 * would blank every label in the panel.
 * @param ctx - the client context, or anything with a `get` method.
 * @returns `'zh'` or `'en'`.
 */
export function resolveLocale(ctx) {
  let active = '';
  try {
    const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
    active = String(locale?.getLocale?.().active ?? '');
  } catch {
    active = '';
  }
  if (active === '' && typeof document !== 'undefined') {
    active = String(document.documentElement?.lang ?? '');
  }
  if (active === '' && typeof navigator !== 'undefined') {
    active = String(navigator.language ?? '');
  }
  return active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Build the panel's translator.
 *
 * The returned function also carries the resolved locale as `.locale`, because
 * the pure data tables in `graph-tables.js` are bilingual objects rather than
 * dictionary keys — a relation label has to read "调用" in a tooltip and in the
 * rail, and routing it through the dictionary would split that single source.
 *
 * @param ctx - the client context.
 * @returns `(key, vars?) => string`, plus `.locale: 'zh' | 'en'`.
 */
export function makeTranslator(ctx) {
  let cachedLocale;
  let bound;
  let current = 'en';

  /** Re-resolve when the locale service handle or its active id changes. */
  const resolve = () => {
    const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
    if (locale === cachedLocale) return;
    cachedLocale = locale;
    try {
      bound = locale && typeof locale.bind === 'function' ? locale.bind('codeslice') : undefined;
    } catch {
      bound = undefined;
    }
    current = resolveLocale(ctx);
  };

  /**
   * @param key - dictionary key.
   * @param vars - `{name}` interpolations.
   * @returns the translated, interpolated string.
   */
  const translate = (key, vars) => {
    resolve();
    let text;
    if (bound !== undefined) {
      try {
        const value = bound(key);
        if (typeof value === 'string' && value !== '' && value !== key) text = value;
      } catch {
        // A locale failure must never blank the panel; the table below answers.
      }
    }
    if (text === undefined) {
      const table = DICT[current] ?? DICT.en;
      text = table[key] ?? DICT.en[key] ?? key;
    }
    if (vars === undefined) return text;
    return text.replace(/\{(\w+)\}/gu, (whole, name) => (
      Object.hasOwn(vars, name) ? String(vars[name]) : whole
    ));
  };

  Object.defineProperty(translate, 'locale', { get: () => { resolve(); return current; } });
  return translate;
}

/**
 * Register the dictionary with the host's locale service.
 *
 * Optional on purpose: a profile without the service still renders, because
 * `makeTranslator` never depends on this call succeeding.
 * @param ctx - the client context.
 */
export function registerLocale(ctx) {
  ctx.inject(['locale'], (inner) => {
    const locale = inner.get('locale') ?? ctx.get('locale');
    if (locale === undefined || typeof locale.register !== 'function') return;
    try {
      ctx.effect(() => locale.register('codeslice', DICT), 'codeslice: locale');
    } catch {
      // A namespace clash only costs the fallback table.
    }
  });
}

/**
 * `"3 minutes ago"` in the active language, without a dictionary entry per unit.
 * @param locale - `'zh'` or `'en'`.
 * @param timestamp - epoch milliseconds.
 * @param now - epoch milliseconds, injectable so a render is pure.
 * @returns a relative phrase, or `''` when there is no timestamp.
 */
export function formatRelative(locale, timestamp, now = Date.now()) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return '';
  const delta = timestamp - now;
  const abs = Math.abs(delta);
  const steps = [
    [60_000, 'second'],
    [3_600_000, 'minute'],
    [86_400_000, 'hour'],
    [2_592_000_000, 'day'],
    [31_536_000_000, 'month'],
  ];
  let unit = 'year';
  let divisor = 31_536_000_000;
  for (const [limit, name] of steps) {
    if (abs < limit) {
      unit = name;
      divisor = limit === 60_000 ? 1_000
        : limit === 3_600_000 ? 60_000
          : limit === 86_400_000 ? 3_600_000
            : limit === 2_592_000_000 ? 86_400_000 : 2_592_000_000;
      break;
    }
  }
  try {
    return new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' })
      .format(Math.round(delta / divisor), unit);
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

/**
 * Locale-correct thousands separators — the header counts are unreadable
 * without them once a graph passes a thousand nodes.
 * @param count - the number.
 * @param locale - `'zh'` or `'en'`.
 * @returns the formatted string.
 */
export function formatInt(count, locale) {
  const value = Number(count);
  if (!Number.isFinite(value)) return '0';
  try {
    return Math.trunc(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
  } catch {
    return String(Math.trunc(value));
  }
}
