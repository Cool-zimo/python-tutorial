/**
 * 笔记面板：编辑 / 预览 / 保存 / 触发同步
 * 保存策略：输入即写 localStorage（绝不丢），4 秒防抖后推到私有仓库。
 */
const Notes = (() => {
  let currentId = null;
  let sync = null;         // ConfigSync 实例，由 app.js 注入
  let saveTimer = null;
  let mode = 'edit';       // edit | preview
  let onChange = null;     // 通知外部（如目录角标）

  const $input = () => document.getElementById('note-input');
  const $status = () => document.getElementById('note-status');

  function attach(syncInstance, changeCb) {
    sync = syncInstance;
    onChange = changeCb;

    $input().addEventListener('input', () => {
      const id = currentId;
      if (!id) return;
      const text = $input().value;
      Store.update(Store.K.NOTES, {}, n => {
        n[id] = { text, updatedAt: new Date().toISOString() };
        return n;
      });
      setStatus('未同步…');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (sync) sync.schedulePush();
      }, 1200);
      if (onChange) onChange();
    });

    document.getElementById('btn-note-edit').onclick = () => setMode('edit');
    document.getElementById('btn-note-preview').onclick = () => setMode('preview');
    document.getElementById('btn-note-clear').onclick = clearCurrent;
    document.getElementById('btn-note-sync').onclick = async () => {
      if (!sync) return toast('还没有连接 GitHub');
      setStatus('同步中…');
      const ok = await sync.syncNow();
      setStatus(ok ? `已同步 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '同步失败');
      load(currentId);
    };
  }

  function setMode(m) {
    mode = m;
    const input = $input(), prev = document.getElementById('note-preview');
    document.getElementById('btn-note-edit').classList.toggle('active', m === 'edit');
    document.getElementById('btn-note-preview').classList.toggle('active', m === 'preview');
    if (m === 'edit') {
      input.hidden = false; prev.hidden = true; input.focus();
    } else {
      prev.innerHTML = MD.render($input().value || '_（还没有笔记）_');
      input.hidden = true; prev.hidden = false;
    }
  }

  function setStatus(s) { const el = $status(); if (el) el.textContent = s; }

  /** 载入某一节的笔记 */
  function load(lessonId) {
    currentId = lessonId;
    if (!lessonId) return;
    const notes = Store.get(Store.K.NOTES, {}) || {};
    const item = notes[lessonId];
    const text = typeof item === 'string' ? item : (item?.text || '');
    $input().value = text;
    if (mode === 'preview') setMode('preview');
    const has = (Store.get(Store.K.SYNCED_AT, 0));
    setStatus(has ? `上次同步 ${new Date(has).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '未同步');
  }

  function clearCurrent() {
    if (!currentId) return;
    if (!confirm('清空这一节的笔记？此操作会同步到你的私有仓库。')) return;
    Store.update(Store.K.NOTES, {}, n => {
      n[currentId] = { text: '', updatedAt: new Date().toISOString() };
      return n;
    });
    $input().value = '';
    if (sync) sync.schedulePush();
    if (onChange) onChange();
    setStatus('已清空，待同步');
  }

  /** 全部笔记导出为一个 Markdown 文件（可下载留档） */
  function exportAll(toc, book) {
    const notes = Store.get(Store.K.NOTES, {}) || {};
    const lines = [`# ${book ? book.title + ' · ' : ''}我的学习笔记`, '',
      `> 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
    const prefix = book ? book.id + '/' : '';
    for (const ch of (toc || [])) {
      lines.push(`## ${ch.title}`, '');
      for (const it of ch.items) {
        const n = notes[prefix + it.id];
        const t = typeof n === 'string' ? n : (n?.text || '');
        if (!t.trim()) continue;
        lines.push(`### ${it.title}`, '', t, '');
      }
    }
    return lines.join('\n');
  }

  function toast(msg) { window.__toast && window.__toast(msg); }

  return { attach, load, exportAll, get currentId() { return currentId; } };
})();
