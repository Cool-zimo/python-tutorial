/**
 * 主应用
 * 路由：  #/                     书单首页
 *        #/book/{bookId}/{lessonId}
 *        #/book/{bookId}/test/{testId}
 *        #/review                今日复习
 */
(() => {
  const $ = id => document.getElementById(id);
  let BOOKS = [];
  let TOC = [];           // 当前书的目录
  let flat = [];          // 扁平课表
  let book = null;        // 当前书
  let current = null;     // 当前课
  let sync = null, api = null;
  let isTestMode = false;

  const keyOf = (b, l) => `${b}/${l}`;

  /* ================= 工具 ================= */
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, ms);
  }
  window.__toast = toast;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.json();
  }
  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  /* ================= 书单首页 ================= */
  async function renderHome() {
    book = null; current = null;
    $('sidebar').classList.remove('open');
    $('scrim').classList.remove('show');
    $('toc').innerHTML = '<div class="toc-chapter">全部教程</div>' +
      `<button class="toc-item" onclick="location.hash='#/review'"><span class="n">🔁</span><span>今日复习</span></button>`;

    const art = $('lesson');
    const st = Review.stats();
    const progress = Store.get(Store.K.PROGRESS, {}) || {};
    const doneCount = Object.keys(progress).length;

    const groups = {};
    BOOKS.forEach(b => { (groups[b.stage] = groups[b.stage] || []).push(b); });

    let html = `
      <div class="home-hero">
        <h1>Python 从零到进阶</h1>
        <p class="home-sub">14 本书 · 浏览器内真跑代码 · 笔记与复习计划跨设备同步</p>
        <div class="home-stats">
          <div class="stat"><b>${doneCount}</b><span>已完成课程</span></div>
          <div class="stat"><b>${st.due}</b><span>今日待复习</span></div>
          <div class="stat"><b>${st.inProgress}</b><span>记忆中</span></div>
        </div>
      </div>`;

    for (const [stage, list] of Object.entries(groups)) {
      html += `<h2 class="home-stage">${escapeHtml(stage)}</h2><div class="book-grid">`;
      for (const b of list) {
        html += `
          <a class="book-card${b.ready ? '' : ' locked'}" href="#/book/${b.id}">
            <div class="book-level">${escapeHtml(b.level)}</div>
            <div class="book-title">${escapeHtml(b.title)}</div>
            <div class="book-sub">${escapeHtml(b.subtitle)}</div>
            <div class="book-desc">${escapeHtml(b.desc)}</div>
            <div class="book-foot">${b.ready ? '开始学习 →' : '🚧 建设中'}</div>
          </a>`;
      }
      html += `</div>`;
    }
    art.innerHTML = html;
    $('lesson-nav').innerHTML = '';
    $('progress-label').textContent = `已完成 ${doneCount} 节`;
    $('progress-fill').style.width = '0%';
    $('book-title').textContent = 'Python 教程';
    document.title = 'Python 从零到进阶';
  }

  /* ================= 目录 ================= */
  async function loadTOC(bookId) {
    TOC = await fetchJSON(`./content/books/${bookId}/toc.json`);
    flat = [];
    for (const ch of TOC) for (const it of ch.items) flat.push({ ...it, chapter: ch.title });
  }

  function renderTOC() {
    const nav = $('toc');
    nav.innerHTML = '';
    const progress = Store.get(Store.K.PROGRESS, {}) || {};
    let done = 0;

    const home = document.createElement('button');
    home.className = 'toc-item';
    home.innerHTML = `<span class="n">🏠</span><span>全部教程</span>`;
    home.onclick = () => { location.hash = '#/'; };
    nav.appendChild(home);

    const rev = document.createElement('button');
    rev.className = 'toc-item' + (location.hash.startsWith('#/review') ? ' active' : '');
    const dueN = Review.dueList().length;
    rev.innerHTML = `<span class="n">🔁</span><span>今日复习</span>` +
      (dueN ? `<span class="tick">${dueN}</span>` : '');
    rev.onclick = () => { location.hash = '#/review'; closeSidebar(); };
    nav.appendChild(rev);

    TOC.forEach((ch, ci) => {
      const h = document.createElement('div');
      h.className = 'toc-chapter';
      h.textContent = ch.title;
      nav.appendChild(h);

      ch.items.forEach(it => {
        const k = keyOf(book.id, it.id);
        const isDone = !!progress[k]?.done;
        if (isDone) done++;
        const b = document.createElement('button');
        b.className = 'toc-item' + (!isTestMode && current?.id === it.id ? ' active' : '');
        b.innerHTML = `<span class="n">${it.id}</span><span>${escapeHtml(it.title)}</span>` +
          (isDone ? '<span class="tick">✅</span>' : '');
        b.onclick = () => { location.hash = `#/book/${book.id}/${it.id}`; closeSidebar(); };
        nav.appendChild(b);
      });

      if (ch.test) {
        const b = document.createElement('button');
        b.className = 'toc-item toc-test' + (isTestMode && current?.id === ch.test ? ' active' : '');
        b.innerHTML = `<span class="n">📝</span><span>本章大测验</span>`;
        b.onclick = () => { location.hash = `#/book/${book.id}/test/${ch.test}`; closeSidebar(); };
        nav.appendChild(b);
      }
    });

    const pct = flat.length ? Math.round(done / flat.length * 100) : 0;
    $('progress-fill').style.width = pct + '%';
    $('progress-label').textContent = `${done} / ${flat.length} 节 · ${pct}%`;
  }

  /* ================= 课文渲染 ================= */
  async function renderLesson(bookId, lessonId) {
    isTestMode = false;
    const item = flat.find(x => String(x.id) === String(lessonId));
    if (!item) { location.hash = '#/'; return; }
    current = item;
    Store.set(Store.K.LAST_POS, { bookId, lessonId });
    renderTOC();

    const art = $('lesson');
    art.innerHTML = '<div class="loading">加载中…</div>';

    let md;
    try {
      md = await fetchText(`./content/books/${bookId}/lessons/${lessonId}.md`);
    } catch (e) {
      art.innerHTML = `<h1>加载失败</h1><p>找不到 <code>${escapeHtml(lessonId)}.md</code></p>`;
      return;
    }

    paint(art, md, keyOf(bookId, lessonId));

    $('book-title').textContent = `${book.title} · ${item.title}`;
    document.title = `${item.title} · ${book.title}`;

    art.appendChild(buildDoneBar(item));
    renderNav(item);
    Notes.load(keyOf(bookId, lessonId));
    window.scrollTo({ top: 0 });
  }

  /** 把 markdown 渲染进容器：正文 + 代码块 + 题目 */
  function paint(art, md, ctxKey) {
    const { html, blocks, quizzes } = MD.renderLesson(md);
    art.innerHTML = html;

    art.querySelectorAll('[data-codeblock]').forEach(holder => {
      const idx = +holder.getAttribute('data-codeblock');
      const blk = blocks[idx];
      if (!blk) { holder.remove(); return; }
      if (blk.lang === 'python' || blk.lang === 'py') {
        holder.replaceWith(CodeBlock.create(blk.code, ctxKey));
      } else {
        const pre = document.createElement('div');
        pre.className = 'codeblock';
        pre.innerHTML = `<div class="codeblock-head"><span class="lang">${escapeHtml(blk.lang)}</span></div>` +
          `<pre><code>${escapeHtml(blk.code)}</code></pre>`;
        holder.replaceWith(pre);
      }
    });

    // 题目
    quizzes.forEach((text, i) => {
      const q = MD.parseQuizText(text);
      const box = Quiz.render(q, i, { key: ctxKey });
      const holder = art.querySelector(`[data-quiz="${i}"]`);
      if (holder) holder.replaceWith(box);
      else art.appendChild(box);
    });
  }

  /* ================= 章末大测验 ================= */
  async function renderTest(bookId, testId) {
    isTestMode = true;
    const ch = TOC.find(c => c.test === testId);
    current = { id: testId, title: (ch ? ch.title.replace(/^第\s*\d+\s*章\s*·\s*/, '') : '') + ' 大测验' };
    renderTOC();

    const art = $('lesson');
    art.innerHTML = '<div class="loading">加载中…</div>';
    let md;
    try {
      md = await fetchText(`./content/books/${bookId}/lessons/${testId}.md`);
    } catch (e) {
      art.innerHTML = '<h1>加载失败</h1>';
      return;
    }

    const ctxKey = keyOf(bookId, testId);
    const { quizzes } = MD.renderLesson(md);
    paint(art, md, ctxKey);
    $('book-title').textContent = `${book.title} · ${current.title}`;
    Notes.load(ctxKey);

    // 全部做完后标记为"复习通过"
    const total = quizzes.length;
    const checkAll = () => {
      const results = Store.get(Store.K.QUIZ, {}) || {};
      const done = Object.keys(results).filter(k => k.startsWith(ctxKey + ':'));
      const okAll = done.filter(k => results[k].ok).length;
      if (okAll >= total && total > 0) {
        toast('🎉 本章大测验全部通过');
        Review.record(ctxKey, true);
        if (sync) sync.schedulePush();
      }
    };
    document.addEventListener('quiz:done', checkAll);
  }

  /* ================= 复习 ================= */
  async function renderReview() {
    isTestMode = false; current = null;
    renderTOC();
    const art = $('lesson');
    const due = Review.dueList();
    const up = Review.upcoming(7);

    let html = `
      <div class="home-hero">
        <h1>🔁 今日复习</h1>
        <p class="home-sub">按艾宾浩斯曲线安排：1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天 → 毕业</p>
      </div>`;

    if (!due.length) {
      html += `<div class="empty-state">
        <div class="empty-icon">🎉</div>
        <p><b>今天没有需要复习的内容</b></p>
        <p class="dim">要么你还没开始学新章节，要么之前的复习计划还没到期。<br>
        去学一节新课，它会在 1 天后回到这里。</p>
      </div>`;
    } else {
      html += `<h2>该复习了（${due.length}）</h2><div class="review-list">`;
      for (const d of due) {
        const [bid, lid] = String(d.key).split('/');
        const b = BOOKS.find(x => x.id === bid);
        html += `
          <div class="review-item">
            <div class="review-meta">
              <span class="review-book">${escapeHtml(b ? b.title : bid)}</span>
              <span class="review-stage">${Review.stageLabel(d.stage)}</span>
            </div>
            <div class="review-title">${escapeHtml(lid)}</div>
            <a class="review-go" href="#/book/${bid}/${lid}">去复习 →</a>
          </div>`;
      }
      html += `</div>`;
    }

    if (up.length) {
      html += `<h2>未来 7 天</h2><div class="review-up">`;
      for (const u of up) {
        html += `<div class="up-item"><span>${escapeHtml(u.key)}</span><span class="dim">${Review.humanDue(u.due)}</span></div>`;
      }
      html += `</div>`;
    }

    art.innerHTML = html;
    $('lesson-nav').innerHTML = '';
  }

  /* ================= 完成标记 ================= */
  function buildDoneBar(item) {
    const k = keyOf(book.id, item.id);
    const progress = Store.get(Store.K.PROGRESS, {}) || {};
    const done = !!progress[k]?.done;
    const rv = (Store.get(Store.K.REVIEW, {}) || {})[k];

    const wrap = document.createElement('div');
    wrap.className = 'lesson-done' + (done ? ' done' : '');
    const span = document.createElement('span');
    span.innerHTML = done
      ? `✅ 已完成 · 下次复习 ${Review.humanDue(rv?.due)}`
      : '⭕ 学完这一节？';
    wrap.appendChild(span);

    const btn = document.createElement('button');
    btn.textContent = done ? '取消标记' : '标记完成';
    btn.onclick = () => {
      const nowDone = !done;
      Store.update(Store.K.PROGRESS, {}, p => {
        if (nowDone) p[k] = { done: true, updatedAt: new Date().toISOString() };
        else delete p[k];
        return p;
      });
      if (nowDone) {
        Review.learn(k);
        toast('已加入复习计划，1 天后回来考你 🔁');
      } else {
        Review.unlearn(k);
      }
      if (sync) sync.schedulePush();
      renderTOC();
      location.reload(); // 简单可靠地刷新状态
    };
    wrap.appendChild(btn);
    return wrap;
  }

  function renderNav(item) {
    const i = flat.findIndex(x => x.id === item.id);
    const nav = $('lesson-nav');
    nav.innerHTML = '';
    const prev = flat[i - 1], next = flat[i + 1];
    if (prev) {
      const a = document.createElement('a');
      a.href = `#/book/${book.id}/${prev.id}`;
      a.innerHTML = `<span class="dir">← 上一节</span>${escapeHtml(prev.title)}`;
      nav.appendChild(a);
    }
    if (next) {
      const a = document.createElement('a');
      a.className = 'next';
      a.href = `#/book/${book.id}/${next.id}`;
      a.innerHTML = `<span class="dir">下一节 →</span>${escapeHtml(next.title)}`;
      nav.appendChild(a);
    }
  }

  /* ================= UI 绑定 ================= */
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('scrim').classList.remove('show');
  }

  function bindUI() {
    $('btn-menu').onclick = () => {
      const s = $('sidebar');
      s.classList.toggle('open');
      $('scrim').classList.toggle('show', s.classList.contains('open'));
    };
    $('scrim').onclick = closeSidebar;
    $('note-fab').onclick = () => $('notes').classList.toggle('open');
    $('btn-settings').onclick = openSettings;
    $('btn-home').onclick = () => { location.hash = '#/'; };

    $('sync-pill').onclick = () => {
      if (!sync) return openSettings();
      sync.syncNow().then(ok => toast(ok ? '已同步' : '同步失败，点右上角检查 token'));
    };

    $('btn-modal-close').onclick = () => { $('modal').hidden = true; };
    $('modal').onclick = e => { if (e.target.id === 'modal') $('modal').hidden = true; };

    window.addEventListener('hashchange', route);
  }

  /* ================= 设置 ================= */
  function openSettings() {
    const token = Store.get(Store.K.TOKEN, '') || '';
    const owner = Store.get(Store.K.OWNER, '') || '';
    const g = Guardian.state();
    $('modal-title').textContent = token ? '设置' : '连接 GitHub 以同步';
    $('modal-body').innerHTML = `
      <div class="callout">
        笔记、进度和复习计划存在你自己的 <b>私有仓库</b> 里，不是本站的数据库。
        换手机、换电脑、清缓存都能恢复。
      </div>
      <h3>今日学习时长</h3>
      <p style="font-size:13.5px;color:var(--text-dim)">
        已学 <b>${Guardian.fmt(g.dayTotal)}</b>　·　今天被打断 <b>${g.breaks || 0}</b> 次
      </p>
      <h3>1. 生成一个 token</h3>
      <ol>
        <li>打开 <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">GitHub → Personal access tokens</a></li>
        <li>选 <b>Fine-grained token</b>，只勾一个权限：<code>Contents: Read and write</code></li>
        <li>有效期建议 90 天，生成后复制（只显示一次）</li>
      </ol>
      <h3>2. 粘贴到下面</h3>
      <input type="text" id="token-input" placeholder="github_pat_... 或 ghp_..." value="${escapeHtml(token)}" autocomplete="off" spellcheck="false">
      <button class="primary-btn" id="btn-save-token">保存并连接</button>
      ${token ? `<button class="ghost-btn" id="btn-disconnect">断开连接（保留本地笔记）</button>` : ''}
      <div class="callout warn" style="margin-top:16px">
        token 只保存在你自己的浏览器，不会上传到本仓库以外的任何地方。
      </div>
      ${owner ? `<p style="font-size:13px;color:var(--text-faint)">账号：<code>${escapeHtml(owner)}</code>　笔记仓库：<code>python-tutorial-notes</code></p>` : ''}
      <h3>导出全部笔记</h3>
      <button class="ghost-btn" id="btn-export">下载我的笔记（Markdown）</button>
    `;
    $('modal').hidden = false;

    $('btn-save-token').onclick = async () => {
      const v = $('token-input').value.trim();
      if (!v) return toast('请先粘贴 token');
      Store.set(Store.K.TOKEN, v);
      $('btn-save-token').textContent = '连接中…';
      $('btn-save-token').disabled = true;
      const ok = await initSync();
      $('btn-save-token').disabled = false;
      if (ok) {
        $('modal').hidden = true;
        toast('已连接，笔记与复习计划将自动同步');
        Notes.attach(sync, () => renderTOC());
      } else $('btn-save-token').textContent = '保存并连接';
    };

    const dc = $('btn-disconnect');
    if (dc) dc.onclick = () => {
      Store.del(Store.K.TOKEN); Store.del(Store.K.OWNER);
      sync = null; syncState('off', '未连接');
      $('modal').hidden = true; toast('已断开');
    };

    $('btn-export').onclick = () => {
      const blob = new Blob([Notes.exportAll(TOC, book)], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `python-notes-${new Date().toISOString().slice(0, 10)}.md`;
      a.click(); URL.revokeObjectURL(a.href);
    };
  }

  /* ================= 同步 ================= */
  function syncState(s, text) {
    const p = $('sync-pill');
    p.dataset.state = s;
    p.querySelector('.sync-text').textContent = text || s;
  }

  async function initSync() {
    const token = Store.get(Store.K.TOKEN, '');
    if (!token) { syncState('off', '未连接'); return false; }
    try {
      api = new GitHubAPI(token);
      sync = new ConfigSync(api);
      sync.onStateChange = syncState;
      await sync.init();
      return true;
    } catch (e) {
      syncState('err', '连接失败');
      toast('连接失败：' + (e.status === 401 ? 'token 无效或已过期' : e.message));
      return false;
    }
  }

  /* ================= 守护 ================= */
  function showBreakPanel(kind, info) {
    const isDaily = kind === 'daily';
    $('modal-title').textContent = isDaily ? '今天学得够多了' : '该休息一下了';
    $('modal-body').innerHTML = `
      <div class="break-hero">${isDaily ? '🌙' : '☕️'}</div>
      <p style="text-align:center;font-size:15px;line-height:1.8;margin:0 0 16px">
        ${isDaily
          ? `你今天已经学了 <b>${Guardian.fmt(info.dayTotal)}</b>。<br>
             一次灌太多，能记住的比例反而会掉 —— 这不是鸡汤，是艾宾浩斯用实验量出来的。<br>
             <span class="dim">剩下的留给明天，睡一觉之后记得更牢。</span>`
          : `你已经连续学了 <b>${Guardian.fmt(Guardian.LIMITS.CONTINUOUS_LIMIT)}</b>。<br>
             站起来走两分钟，看看远处，让眼睛和脑子都缓一缓。<br>
             <span class="dim">今天累计：${Guardian.fmt(info.dayTotal)}</span>`}
      </p>
      <div class="callout">
        休息不是浪费时间。记忆的巩固发生在你<b>不学习的时候</b> —— 大脑需要空档来整理刚才接收的东西。
      </div>
      <button class="primary-btn" id="btn-rest">好，休息 10 分钟</button>
      <button class="ghost-btn" id="btn-continue">我知道了，再学一会儿</button>
    `;
    $('modal').hidden = false;
    $('btn-rest').onclick = () => { Guardian.takeBreak(10); $('modal').hidden = true; toast('10 分钟后再继续 ✨'); };
    $('btn-continue').onclick = () => { Guardian.resume(); $('modal').hidden = true; };
  }

  /* ================= 路由 ================= */
  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);

    if (!parts.length || parts[0] === '') return renderHome();
    if (parts[0] === 'review') return renderReview();
    if (parts[0] === 'book' && parts[1]) {
      const bid = parts[1];
      if (!book || book.id !== bid) {
        book = BOOKS.find(b => b.id === bid);
        if (!book) { location.hash = '#/'; return; }
        try { await loadTOC(bid); }
        catch (e) { toast('这本书还没内容'); location.hash = '#/'; return; }
      }
      if (parts[2] === 'test' && parts[3]) return renderTest(bid, parts[3]);
      if (parts[2]) return renderLesson(bid, parts[2]);
      // 只给了书名 -> 跳到上次阅读或第一节
      const last = Store.get(Store.K.LAST_POS, null);
      const target = (last && last.bookId === bid) ? last.lessonId : (flat[0] && flat[0].id);
      return target ? renderLesson(bid, target) : renderHome();
    }
    return renderHome();
  }

  /* ================= 启动 ================= */
  async function boot() {
    try {
      BOOKS = await fetchJSON('./content/books.json');
    } catch (e) {
      $('lesson').innerHTML = '<h1>加载失败</h1><p>请确认已开启 GitHub Pages。</p>';
      return;
    }
    bindUI();
    Notes.attach(null, () => renderTOC());

    const token = Store.get(Store.K.TOKEN, '');
    if (token) {
      await initSync();
      Notes.attach(sync, () => renderTOC());
    } else syncState('off', '未连接');

    Guardian.start(showBreakPanel);

    await route();
    renderTOC();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
