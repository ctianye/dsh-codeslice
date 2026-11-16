/**
 * Copy for the CodeSlice reader sidebar (`codeslice:reader`).
 *
 * Two complete tables, same key set, the discipline of `i18n.js`: a half
 * translated pane is worse than an untranslated one. The integration side
 * merges this dictionary into the bundle through `mergeDict(ctx, SIDEBAR_LOCALE)`,
 * so every key here is owned by the sidebar area alone.
 */

export const SIDEBAR_LOCALE = {
  zh: {
    /* ---- file tree ------------------------------------------------- */
    'reader.tree.filter': '按路径筛选文件',
    'reader.tree.loading': '正在读取文件树…',
    'reader.tree.empty': '工作区里没有文件',
    'reader.tree.error': '文件树加载失败',
    'reader.tree.retry': '重试',

    /* ---- tabs ------------------------------------------------------ */
    'reader.tab.close': '关闭标签',

    /* ---- editor / empty state -------------------------------------- */
    'reader.editor.loading': '正在加载编辑器…',
    'reader.editor.failed': '编辑器加载失败',
    'reader.error.title': '代码读取失败',
    'reader.empty.title': '还没有打开文件',
    'reader.empty.body': '从左侧文件树选择一个文件开始阅读。',
    'reader.notFound': '这个文件不在工作区里：{path}',
    'reader.refresh': '重新读取',
    'reader.lines': '{count} 行',

    /* ---- selection ------------------------------------------------- */
    'reader.selected': '已选第 {start}-{end} 行 · {count} 行',
    'reader.hint': '点行号选起点，再点一行选终点；也可以直接拖选文本',
    'reader.action.ask': '问 CodeSlice',
    'reader.action.note': '转笔记',
    'reader.action.copy': '复制',
    'reader.action.clear': '清除',
    'reader.copied': '已复制',

    /* ---- note form -------------------------------------------------- */
    'reader.note.title': '笔记标题',
    'reader.note.defaultTitle': '{file} 第 {start}-{end} 行',
    'reader.note.save': '保存笔记',
    'reader.note.cancel': '取消',
    'reader.note.saved': '已存为笔记：{title}',
    'reader.note.failed': '存笔记失败：{detail}',

    /* ---- frames ----------------------------------------------------- */
    'reader.frames.none': '这个文件还没有关联区间。',
    'reader.frame.moved': '已移动',
    'reader.frame.missing': '已失效',
    'reader.frame.movedRange': '原 {start}-{end}',
    'reader.frame.open': '打开对话定位',
    'reader.frame.delete': '删除区间',
    'reader.frame.citation': '笔记引用',
    'reader.history.banner': '历史版本 {sha} · {date} · {subject}（当前工作区已没有这段代码）',
  },

  en: {
    /* ---- file tree ------------------------------------------------- */
    'reader.tree.filter': 'Filter files by path',
    'reader.tree.loading': 'Reading the file tree…',
    'reader.tree.empty': 'No files in this workspace',
    'reader.tree.error': 'Could not load the file tree',
    'reader.tree.retry': 'Retry',

    /* ---- tabs ------------------------------------------------------ */
    'reader.tab.close': 'Close tab',

    /* ---- editor / empty state -------------------------------------- */
    'reader.editor.loading': 'Loading editor…',
    'reader.editor.failed': 'Editor failed to load',
    'reader.error.title': 'Could not read the code',
    'reader.empty.title': 'No file open',
    'reader.empty.body': 'Pick a file from the tree to start reading.',
    'reader.notFound': 'That file is not in the workspace: {path}',
    'reader.refresh': 'Read again',
    'reader.lines': '{count} lines',

    /* ---- selection ------------------------------------------------- */
    'reader.selected': 'Lines {start}-{end} selected · {count} lines',
    'reader.hint': 'Click a line number for the start, another for the end — or drag text',
    'reader.action.ask': 'Ask CodeSlice',
    'reader.action.note': 'Save as note',
    'reader.action.copy': 'Copy',
    'reader.action.clear': 'Clear selection',
    'reader.copied': 'Copied',

    /* ---- note form -------------------------------------------------- */
    'reader.note.title': 'Note title',
    'reader.note.defaultTitle': '{file} lines {start}-{end}',
    'reader.note.save': 'Save note',
    'reader.note.cancel': 'Cancel',
    'reader.note.saved': 'Note saved: {title}',
    'reader.note.failed': 'Could not save the note: {detail}',

    /* ---- frames ----------------------------------------------------- */
    'reader.frames.none': 'No framed range in this file yet.',
    'reader.frame.moved': 'Moved',
    'reader.frame.missing': 'Missing',
    'reader.frame.movedRange': 'was {start}-{end}',
    'reader.frame.open': 'Open the conversation',
    'reader.frame.delete': 'Delete range',
    'reader.frame.citation': 'Note citation',
    'reader.history.banner': 'History {sha} · {date} · {subject} (this code is gone from the worktree)',
  },
};
