/**
 * Workbench settings page (Agent D surface).
 *
 * Three blocks:
 *   1. Two prompts — note-generation and knowledge Q&A — edited in textareas,
 *      saved through `prompts op=save`, reset through `prompts op=reset`, with a
 *      custom/default badge and a read-only view of the shipped default.
 *   2. Retrieval settings — the legacy field names are kept on purpose:
 *      `topK`, `rrfK`, `families`, `includeNotes`, `includeGraph`, saved
 *      through the existing `rag op=write` channel.
 *   3. Vector index state — read from `status`, falling back to the `index`
 *      projection returned by `rag op=read`; a missing index renders "unknown"
 *      and never throws.
 *
 * Every Host method is optional in this build: a missing method or a missing
 * field degrades to an editable form / an unknown badge, not a crash.
 */

import {
  Glyph, h, useState, useEffect, useMemo, useCallback, useRef,
} from '../icons.js';
import { makeCaller, makeRequestScope } from '../api.js';
import { formatInt } from '../i18n.js';

/** Relation families, in the Host's own order (see `lib/model.js`). */
const WB_FAMILIES = ['behaviour', 'dependency', 'structure', 'hierarchy', 'meaning'];

/** Fallback retrieval config when the `rag` method is absent or its read fails. */
const WB_RAG_FALLBACK = Object.freeze({
  topK: 8,
  rrfK: 60,
  families: WB_FAMILIES.slice(),
  includeNotes: true,
  includeGraph: true,
});

/** A prompt pair counts as custom when a non-empty custom text is stored. */
function wbPromptIsCustom(pair) {
  const custom = pair && pair.custom;
  return typeof custom === 'string' && custom.trim() !== '';
}

/** The text a freshly opened editor shows: custom override, else the default. */
function wbPromptValue(pair) {
  if (pair === undefined || pair === null) return '';
  if (typeof pair.custom === 'string' && pair.custom.trim() !== '') return pair.custom;
  return typeof pair.effective === 'string' ? pair.effective : (typeof pair.default === 'string' ? pair.default : '');
}

/**
 * One prompt editor block: label, custom/default badge, textarea, default
 * viewer and reset action.
 * @param props - `{which, label, pair, draft, busy, resetArmed, showDefault,
 *   onDraft, onToggleDefault, onReset, t}`.
 * @returns the block.
 */
function WbPromptBlock(props) {
  const {
    which, label, pair, draft, busy, resetArmed, showDefault,
    onDraft, onToggleDefault, onReset, t,
  } = props;
  const custom = wbPromptIsCustom(pair);
  const defaultValue = typeof pair?.default === 'string' ? pair.default : '';

  return h('div', { className: 'wb-field', 'data-cs': 'prompt-block', 'data-which': which },
    h('div', { className: 'wb-prompt-head' },
      h('span', null, label),
      h('span', { className: `wb-tag ${custom ? 'wb-accent' : ''}` },
        custom ? t('wb.settings.prompts.custom') : t('wb.settings.prompts.default')),
      h('button', {
        type: 'button',
        className: 'cs-btn cs-small cs-ghost',
        onClick: onToggleDefault,
      }, showDefault ? t('wb.settings.prompts.hideDefault') : t('wb.settings.prompts.viewDefault')),
      h('button', {
        type: 'button',
        className: `cs-btn cs-small cs-ghost${resetArmed ? ' cs-danger' : ''}`,
        disabled: busy,
        title: t('wb.settings.prompts.resetConfirm'),
        onClick: onReset,
      }, resetArmed ? t('wb.settings.prompts.resetArm') : t('wb.settings.prompts.reset'))),
    h('textarea', {
      className: 'wb-textarea',
      rows: 6,
      value: draft,
      'aria-label': label,
      disabled: busy,
      placeholder: defaultValue === '' ? t('wb.settings.prompts.empty') : defaultValue,
      onChange: (event) => onDraft(event.target.value),
    }),
    showDefault
      ? h('pre', { className: 'wb-default-view' }, defaultValue === '' ? t('wb.settings.prompts.empty') : defaultValue)
      : null);
}

/**
 * The settings page.
 * @param props - `{ctx, scope, parked, t, locale}`.
 * @returns the settings page.
 */
export function SettingsPage(props) {
  const { ctx, scope, parked, t, locale } = props;
  const cwd = scope && typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined;
  const call = useMemo(() => makeCaller(ctx, cwd), [ctx, cwd]);

  /* ---- prompts state ---------------------------------------------- */
  const [prompts, setPrompts] = useState(undefined);
  const [draft, setDraft] = useState({ system: '', qa: '', note: '' });
  const [promptsBusy, setPromptsBusy] = useState(false);
  const [promptsNotice, setPromptsNotice] = useState(undefined);
  const [resetArmed, setResetArmed] = useState(undefined);
  const [showDefault, setShowDefault] = useState({ system: false, qa: false, note: false });

  /* ---- retrieval state -------------------------------------------- */
  const [ragConfig, setRagConfig] = useState(undefined);
  const [draftRag, setDraftRag] = useState({ ...WB_RAG_FALLBACK, families: WB_FAMILIES.slice() });
  const [ragBusy, setRagBusy] = useState(false);
  const [ragNotice, setRagNotice] = useState(undefined);

  /* ---- vector index state ------------------------------------------ */
  const [indexStatus, setIndexStatus] = useState(undefined);

  /* ---- local model state ------------------------------------------- */
  // `models op=status` is the only call that reaches Ollama; keeping it here
  // means the page can say "not detected" instead of leaving the reader to
  // guess why the index is empty.
  const [modelInfo, setModelInfo] = useState(undefined);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelNotice, setModelNotice] = useState(undefined);
  const [testResult, setTestResult] = useState(undefined);
  const [indexBusy, setIndexBusy] = useState(false);

  const alive = useRef(true);
  const requests = useRef(undefined);
  const pollTimer = useRef(undefined);

  useEffect(() => {
    alive.current = true;
    const scopeReq = makeRequestScope();
    requests.current = scopeReq;
    return () => {
      alive.current = false;
      scopeReq.dispose();
      requests.current = undefined;
    };
  }, []);

  /* ---- load --------------------------------------------------------- */

  useEffect(() => {
    if (parked) return undefined;

    // Each section needs its own request scope. `run` aborts the previous call
    // by design, so sharing one scope made the prompts read cancel itself as
    // soon as the rag/status reads started — the visible symptom was three
    // empty prompt textareas even though the API returned full defaults.
    const promptReq = makeRequestScope();
    const ragReq = makeRequestScope();
    const statusReq = makeRequestScope();
    const ragStatusReq = makeRequestScope();
    const modelsReq = makeRequestScope();

    // Local Ollama probe: status is a value, never a throw, so a machine without
    // Ollama still renders the whole card.
    modelsReq.run((signal) => call('models', { op: 'status' }, signal))
      .then((value) => {
        if (alive.current && value !== undefined) setModelInfo(value);
      })
      .catch(() => {
        if (alive.current) setModelInfo({ error: true });
      });

    // Prompts: read the three pairs; a missing method leaves the draft editable.
    promptReq.run((signal) => call('prompts', { op: 'read' }, signal))
      .then((value) => {
        if (!alive.current || value === undefined) return;
        setPrompts(value);
        setDraft({
          system: wbPromptValue(value.system),
          qa: wbPromptValue(value.qa),
          note: wbPromptValue(value.note),
        });
      })
      .catch(() => {
        if (alive.current) setPromptsNotice({ kind: 'bad', text: t('wb.settings.prompts.loadFailed') });
      });

    // Retrieval config + index projection from the existing `rag` channel.
    ragReq.run((signal) => call('rag', { op: 'read' }, signal))
      .then((value) => {
        if (!alive.current || value === undefined) return;
        if (value.config !== undefined) setRagConfig(value.config);
        if (value.index !== undefined) setIndexStatus(value.index);
      })
      .catch(() => {
        if (alive.current) setRagNotice({ kind: 'bad', text: t('wb.settings.retrieval.loadFailed') });
      });

    // Status: the contract adds `projects` / `prompts` summaries here, and the
    // vector index may ride along as `index`; read it best-effort and only
    // fill a gap the `rag` channel left empty.
    statusReq.run((signal) => call('status', {}, signal))
      .then((value) => {
        if (!alive.current || value === undefined) return;
        const fromStatus = value.index ?? (value.rag && value.rag.index);
        if (fromStatus !== undefined) setIndexStatus(fromStatus);
      })
      .catch(() => { /* unknown index state is acceptable */ });

    // Legacy rag status projection, matching the old workbench panel.
    ragStatusReq.run((signal) => call('rag', { op: 'status' }, signal))
      .then((value) => {
        if (!alive.current || value === undefined) return;
        if (value.index !== undefined) setIndexStatus(value.index);
      })
      .catch(() => { /* unknown index state is acceptable */ });

    return () => {
      promptReq.dispose();
      ragReq.dispose();
      statusReq.dispose();
      ragStatusReq.dispose();
      modelsReq.dispose();
    };
  }, [parked, call, t]);

  /* Sync the retrieval draft whenever a fresh config lands. */
  useEffect(() => {
    if (ragConfig === undefined) return;
    setDraftRag({
      topK: Number.isFinite(Number(ragConfig.topK)) ? Number(ragConfig.topK) : WB_RAG_FALLBACK.topK,
      rrfK: Number.isFinite(Number(ragConfig.rrfK)) ? Number(ragConfig.rrfK) : WB_RAG_FALLBACK.rrfK,
      families: Array.isArray(ragConfig.families) ? [...ragConfig.families] : WB_FAMILIES.slice(),
      includeNotes: ragConfig.includeNotes !== false,
      includeGraph: ragConfig.includeGraph !== false,
    });
  }, [ragConfig]);

  /* ---- prompt mutations -------------------------------------------- */

  const savePrompts = useCallback(async () => {
    setPromptsBusy(true);
    setPromptsNotice(undefined);
    try {
      const value = await requests.current.run((signal) => call('prompts', {
        op: 'save',
        system: draft.system.trim() === '' ? null : draft.system,
        qa: draft.qa.trim() === '' ? null : draft.qa,
        note: draft.note.trim() === '' ? null : draft.note,
      }, signal));
      if (!alive.current) return;
      if (value !== undefined) {
        setPrompts(value);
        setDraft({
          system: wbPromptValue(value.system),
          qa: wbPromptValue(value.qa),
          note: wbPromptValue(value.note),
        });
      }
      setPromptsNotice({ kind: 'ok', text: t('wb.settings.prompts.saved') });
    } catch (caught) {
      if (alive.current) setPromptsNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setPromptsBusy(false);
    }
  }, [call, draft, t]);

  const resetPrompts = useCallback(async (which) => {
    setPromptsBusy(true);
    setPromptsNotice(undefined);
    try {
      const value = await requests.current.run((signal) => call('prompts', { op: 'reset', which }, signal));
      if (!alive.current) return;
      if (value !== undefined) {
        setPrompts(value);
        setDraft({
          system: wbPromptValue(value.system),
          qa: wbPromptValue(value.qa),
          note: wbPromptValue(value.note),
        });
      }
      setPromptsNotice({ kind: 'ok', text: t('wb.settings.prompts.saved') });
    } catch (caught) {
      if (alive.current) setPromptsNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) {
        setPromptsBusy(false);
        setResetArmed(undefined);
      }
    }
  }, [call, t]);

  /* ---- retrieval mutations ----------------------------------------- */

  const patchRag = useCallback((key, value) => {
    setDraftRag((current) => ({ ...current, [key]: value }));
  }, []);

  const toggleFamily = useCallback((name) => {
    setDraftRag((current) => {
      const has = current.families.includes(name);
      return {
        ...current,
        families: has ? current.families.filter((row) => row !== name) : [...current.families, name],
      };
    });
  }, []);

  const saveRag = useCallback(async () => {
    setRagBusy(true);
    setRagNotice(undefined);
    try {
      const value = await requests.current.run((signal) => call('rag', {
        op: 'write',
        config: { ...draftRag },
      }, signal));
      if (!alive.current) return;
      if (value && value.config !== undefined) setRagConfig(value.config);
      setRagNotice({ kind: 'ok', text: t('wb.settings.retrieval.saved') });
    } catch (caught) {
      if (alive.current) setRagNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setRagBusy(false);
    }
  }, [call, draftRag, t]);

  /* ---- model + index actions ---------------------------------------- */

  const refreshModels = useCallback(async () => {
    setModelBusy(true);
    setModelNotice(undefined);
    try {
      const value = await requests.current.run((signal) => call('models', { op: 'status' }, signal));
      if (!alive.current) return;
      if (value !== undefined) setModelInfo(value);
    } catch (caught) {
      if (alive.current) setModelNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setModelBusy(false);
    }
  }, [call]);

  const pickModel = useCallback(async (model) => {
    if (model === '') return;
    setModelBusy(true);
    setModelNotice(undefined);
    setTestResult(undefined);
    try {
      const value = await requests.current.run((signal) => call('models', {
        op: 'write',
        settings: { embedding: { model } },
      }, signal));
      if (!alive.current) return;
      if (value?.settings !== undefined) {
        setModelInfo((current) => ({ ...(current ?? {}), ...value }));
      }
      setModelNotice({ kind: 'ok', text: t('wb.settings.models.saved', { model }) });
      const status = await requests.current.run((signal) => call('rag', { op: 'status' }, signal));
      if (alive.current && status?.index !== undefined) setIndexStatus(status.index);
    } catch (caught) {
      if (alive.current) setModelNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setModelBusy(false);
    }
  }, [call, t]);

  const testEmbedding = useCallback(async () => {
    setModelBusy(true);
    setModelNotice(undefined);
    setTestResult(undefined);
    try {
      const value = await requests.current.run((signal) => call('models', { op: 'test' }, signal));
      if (!alive.current) return;
      if (value?.result !== undefined) setTestResult(value.result);
    } catch (caught) {
      if (alive.current) setModelNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setModelBusy(false);
    }
  }, [call]);

  const rebuildIndex = useCallback(async () => {
    setIndexBusy(true);
    try {
      const value = await requests.current.run((signal) => call('rag', {
        op: 'index',
        force: true,
      }, signal));
      if (!alive.current) return;
      if (value?.index !== undefined) setIndexStatus(value.index);
    } catch (caught) {
      if (alive.current) setRagNotice({
        kind: 'bad',
        text: caught && caught.message ? caught.message : String(caught),
      });
    } finally {
      if (alive.current) setIndexBusy(false);
    }
  }, [call]);

  const refreshIndex = useCallback(async () => {
    try {
      const value = await requests.current.run((signal) => call('rag', { op: 'status' }, signal));
      if (alive.current && value?.index !== undefined) setIndexStatus(value.index);
    } catch { /* a probe interval may fail; the next tick retries */ }
  }, [call]);

  /* Poll while the Host is building: the index call returns immediately with
     state=running, and there is no push channel to learn it finished. */
  useEffect(() => {
    if (indexStatus?.state !== 'running') return undefined;
    const timer = setInterval(() => { void refreshIndex(); }, 1200);
    pollTimer.current = timer;
    return () => {
      clearInterval(timer);
      pollTimer.current = undefined;
    };
  }, [indexStatus?.state, refreshIndex]);

  /* ---- index projection --------------------------------------------- */

  const index = indexStatus ?? {};
  const indexState = typeof index.state === 'string' ? index.state : undefined;
  const indexTone = indexState === 'ready' ? 'wb-ok'
    : indexState === 'running' ? 'wb-warn'
      : indexState === 'error' ? 'wb-bad' : '';
  const indexLabel = indexState === undefined
    ? t('wb.settings.index.unknown')
    : t(`wb.settings.index.${indexState}`);
  const indexHasScale = Number(index.vectors) > 0 || Number(index.chunks) > 0
    || (typeof index.model === 'string' && index.model !== '');
  const indexTotal = Number(index.chunks ?? 0);
  const indexDone = Number(index.vectors ?? index.done ?? 0);
  const indexPercent = indexTotal > 0 ? Math.min(100, Math.round((indexDone / indexTotal) * 100)) : 0;

  const embedding = modelInfo?.settings?.embedding ?? {};
  const ollama = modelInfo?.ollama;
  const ollamaOnline = ollama?.available === true;
  const ollamaModels = Array.isArray(ollama?.models) ? ollama.models : [];
  const currentModel = typeof embedding.model === 'string' ? embedding.model : '';
  const modelOptions = [...new Set([currentModel, ...ollamaModels, 'bge-m3'].filter((row) => row !== ''))];
  const modelTone = modelInfo === undefined
    ? ''
    : ollamaOnline ? 'wb-ok' : 'wb-bad';
  const modelLabel = modelInfo === undefined
    ? t('wb.settings.models.checking')
    : ollamaOnline ? t('wb.settings.models.online') : t('wb.settings.models.offline');

  const numberField = (key, label, min, max, unit) => h('label', { className: 'wb-field', key },
    h('span', { className: 'wb-field-label' }, label),
    h('span', { className: 'wb-num' },
      h('input', {
        type: 'number',
        className: 'cs-input',
        min,
        max,
        value: draftRag[key],
        onChange: (event) => patchRag(key, Number(event.target.value)),
      }),
      h('span', { className: 'wb-unit' }, unit)));

  const familyPill = (name) => {
    const on = draftRag.families.includes(name);
    return h('button', {
      type: 'button',
      key: name,
      className: 'wb-pill',
      'data-on': on ? 'true' : 'false',
      'aria-pressed': on ? 'true' : 'false',
      onClick: () => toggleFamily(name),
    }, h('span', { className: 'wb-pill-mark' }, on ? Glyph.check(10) : null),
    h('span', null, t(`family.${name}`)));
  };

  const switchRow = (label, key, hint) => h('div', { className: 'wb-meta-row' },
    h('div', { className: 'wb-meta-text' },
      h('span', { className: 'wb-meta-label' }, label),
      hint === undefined ? null : h('span', { className: 'wb-meta-hint' }, hint)),
    h('button', {
      type: 'button',
      className: 'wb-switch',
      'data-on': draftRag[key] ? 'true' : 'false',
      role: 'switch',
      'aria-checked': draftRag[key] ? 'true' : 'false',
      'aria-label': label,
      onClick: () => patchRag(key, !draftRag[key]),
    }, h('span', { className: 'wb-switch-knob' })));

  return h('div', { className: 'wb-settings' },

    /* ---- prompts -------------------------------------------------- */
    h('section', { className: 'wb-section', 'data-cs': 'prompt-settings' },
      h('div', { className: 'wb-section-head' },
        h('b', null, t('wb.settings.prompts.title'))),
      h(WbPromptBlock, {
        which: 'system',
        label: t('wb.settings.prompts.system.label'),
        pair: prompts?.system,
        draft: draft.system,
        busy: promptsBusy,
        resetArmed: resetArmed === 'system',
        showDefault: showDefault.system,
        onDraft: (value) => setDraft((current) => ({ ...current, system: value })),
        onToggleDefault: () => setShowDefault((current) => ({ ...current, system: !current.system })),
        onReset: () => {
          if (resetArmed === 'system') void resetPrompts('system');
          else setResetArmed('system');
        },
        t,
      }),
      h(WbPromptBlock, {
        which: 'qa',
        label: t('wb.settings.prompts.qa.label'),
        pair: prompts?.qa,
        draft: draft.qa,
        busy: promptsBusy,
        resetArmed: resetArmed === 'qa',
        showDefault: showDefault.qa,
        onDraft: (value) => setDraft((current) => ({ ...current, qa: value })),
        onToggleDefault: () => setShowDefault((current) => ({ ...current, qa: !current.qa })),
        onReset: () => {
          if (resetArmed === 'qa') void resetPrompts('qa');
          else setResetArmed('qa');
        },
        t,
      }),
      h(WbPromptBlock, {
        which: 'note',
        label: t('wb.settings.prompts.note.label'),
        pair: prompts?.note,
        draft: draft.note,
        busy: promptsBusy,
        resetArmed: resetArmed === 'note',
        showDefault: showDefault.note,
        onDraft: (value) => setDraft((current) => ({ ...current, note: value })),
        onToggleDefault: () => setShowDefault((current) => ({ ...current, note: !current.note })),
        onReset: () => {
          if (resetArmed === 'note') void resetPrompts('note');
          else setResetArmed('note');
        },
        t,
      }),
      promptsNotice === undefined
        ? null
        : h('div', { className: `wb-notice ${promptsNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
          h('span', null, promptsNotice.text)),
      h('div', { className: 'wb-actions' },
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small cs-ghost',
          disabled: promptsBusy,
          onClick: () => {
            if (resetArmed === 'all') void resetPrompts('all');
            else setResetArmed('all');
          },
        }, resetArmed === 'all' ? t('wb.settings.prompts.resetArm') : t('wb.settings.prompts.resetAll')),
        h('span', { className: 'cs-grow' }),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-small cs-primary',
          disabled: promptsBusy,
          onClick: () => { void savePrompts(); },
        }, promptsBusy ? t('common.saving') : t('wb.settings.prompts.save')))),

    /* ---- retrieval ------------------------------------------------- */
    h('section', { className: 'wb-section', 'data-cs': 'retrieval-settings' },
      h('div', { className: 'wb-section-head' },
        h('div', { className: 'wb-section-text' },
          h('b', null, t('wb.settings.retrieval.title')),
          h('span', { className: 'wb-section-desc' }, t('wb.settings.retrieval.desc')))),
      h('div', { className: 'wb-grid' },
        numberField('topK', t('wb.settings.retrieval.topK'), 1, 24, t('wb.settings.retrieval.topKUnit')),
        numberField('rrfK', t('wb.settings.retrieval.rrfK'), 1, 100, t('wb.settings.retrieval.rrfKUnit'))),
      h('div', { className: 'wb-field' },
        h('span', { className: 'wb-field-label' }, t('wb.settings.retrieval.families')),
        h('div', { className: 'wb-pills' }, WB_FAMILIES.map(familyPill))),
      h('div', { className: 'wb-meta' },
        switchRow(t('wb.settings.retrieval.includeNotes'), 'includeNotes', t('wb.settings.retrieval.includeNotesHint')),
        switchRow(t('wb.settings.retrieval.includeGraph'), 'includeGraph', t('wb.settings.retrieval.includeGraphHint'))),
      ragNotice === undefined
        ? null
        : h('div', { className: `wb-notice ${ragNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
          h('span', null, ragNotice.text)),
      h('div', { className: 'wb-actions' },
        h('span', { className: 'cs-grow' }),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-primary wb-btn',
          disabled: ragBusy,
          onClick: () => { void saveRag(); },
        }, ragBusy ? t('common.saving') : t('wb.settings.retrieval.save')))),

    /* ---- local embedding model ------------------------------------- */
    h('section', { className: 'wb-section', 'data-cs': 'model-settings' },
      h('div', { className: 'wb-section-head' },
        h('div', { className: 'wb-section-text' },
          h('b', null, t('wb.settings.models.title')),
          h('span', { className: 'wb-section-desc' }, t('wb.settings.models.desc'))),
        h('span', { className: `wb-tag ${modelTone}` }, modelLabel),
        h('button', {
          type: 'button',
          className: 'cs-btn cs-ghost wb-btn wb-btn-sm',
          disabled: modelBusy,
          title: t('wb.settings.models.recheck'),
          onClick: () => { void refreshModels(); },
        }, Glyph.refresh(12))),
      h('div', { className: 'wb-meta' },
        h('div', { className: 'wb-meta-row' },
          h('div', { className: 'wb-meta-text' },
            h('span', { className: 'wb-meta-label' }, t('wb.settings.models.baseUrl')),
            h('span', { className: 'wb-meta-hint' }, typeof embedding.base_url === 'string' && embedding.base_url !== ''
              ? embedding.base_url
              : 'http://127.0.0.1:11434/v1')),
          h('span', { className: 'wb-meta-value' }, t('wb.settings.models.loopbackOnly'))),
        h('div', { className: 'wb-meta-row' },
          h('div', { className: 'wb-meta-text' },
            h('span', { className: 'wb-meta-label' }, t('wb.settings.models.model')),
            h('span', { className: 'wb-meta-hint' }, ollamaModels.length > 0
              ? t('wb.settings.models.found', { n: String(ollamaModels.length) })
              : t('wb.settings.models.foundNone'))),
          h('select', {
            className: 'cs-input wb-select',
            value: currentModel,
            disabled: modelBusy,
            onChange: (event) => { void pickModel(event.target.value); },
          }, modelOptions.map((name) => h('option', { key: name, value: name }, name))))),
      modelNotice === undefined
        ? null
        : h('div', { className: `wb-notice ${modelNotice.kind === 'ok' ? 'wb-ok' : 'wb-bad'}` },
          h('span', null, modelNotice.text)),
      !ollamaOnline && modelInfo !== undefined
        ? h('div', { className: 'wb-notice wb-bad' },
          h('span', null, ollama?.error
            ? t('wb.settings.models.offlineHint', { error: String(ollama.error) })
            : t('wb.settings.models.noOllama')))
        : null,
      testResult === undefined
        ? null
        : h('div', { className: `wb-notice ${testResult.ok === true ? 'wb-ok' : 'wb-bad'}` },
          testResult.ok === true
            ? t('wb.settings.models.testOk', {
              model: String(testResult.model ?? currentModel),
              dims: formatInt(testResult.dims ?? 0, locale),
            })
            : t('wb.settings.models.testBad', { error: String(testResult.error ?? 'unknown') })),
      h('div', { className: 'wb-actions' },
        h('span', { className: 'cs-grow' }),
        h('button', {
          type: 'button',
          className: 'cs-btn wb-btn',
          disabled: modelBusy,
          onClick: () => { void testEmbedding(); },
        }, modelBusy ? t('wb.settings.models.testing') : t('wb.settings.models.test')))),

    /* ---- vector index ---------------------------------------------- */
    h('section', { className: 'wb-section', 'data-cs': 'index-status' },
      h('div', { className: 'wb-section-head' },
        h('div', { className: 'wb-section-text' },
          h('b', null, t('wb.settings.index.title')),
          h('span', { className: 'wb-section-desc' }, t('wb.settings.index.desc'))),
        h('span', { className: `wb-tag ${indexTone}` }, indexLabel)),
      h('div', { className: 'wb-meter' },
        h('div', { className: 'wb-meter-head' },
          h('span', null, indexHasScale
            ? t('wb.settings.index.summary', {
              vectors: formatInt(index.vectors ?? 0, locale),
              chunks: formatInt(index.chunks ?? 0, locale),
              model: typeof index.model === 'string' && index.model !== '' ? index.model : '—',
            })
            : t('wb.settings.index.empty')),
          h('span', { className: 'wb-meter-pct' }, `${indexPercent}%`)),
        h('div', { className: 'wb-bar' },
          h('span', { className: 'wb-bar-fill', style: { width: `${indexPercent}%` } }))),
      indexState === 'running'
        ? h('div', { className: 'wb-notice' }, t('wb.settings.index.progress', {
          done: formatInt(index.done ?? 0, locale),
          total: formatInt(index.total ?? 0, locale),
          failed: formatInt(index.failed ?? 0, locale),
        }))
        : null,
      h('div', { className: 'wb-notice' }, t('wb.settings.index.hint')),
      h('div', { className: 'wb-actions' },
        h('span', { className: 'cs-grow' }),
        h('button', {
          type: 'button',
          className: 'cs-btn wb-btn',
          disabled: indexBusy || indexState === 'running' || !ollamaOnline,
          title: ollamaOnline ? t('wb.settings.index.rebuild') : t('wb.settings.index.rebuildNoModel'),
          onClick: () => { void rebuildIndex(); },
        }, indexBusy || indexState === 'running' ? t('wb.settings.index.rebuilding') : t('wb.settings.index.rebuild')))));
}
