/**
 * 题目引擎
 *
 * 题型（在 .md 里用 ```quiz 围栏书写）：
 *   choice  选择题   —— 单选/多选，即时判分
 *   fill    填空题   —— 关键词匹配（大小写/空格不敏感）
 *   code    程序题   —— 在 Pyodide 里真跑 assert，通过了才算会
 *   project 小项目   —— 开放式，给验收清单自评
 *
 * 设计原则：判分全部在浏览器本地完成，不上传答案；
 * 但「做过/做对」的结果会记入进度，参与艾宾浩斯复习调度。
 */
const Quiz = (() => {

  /* ================= 解析 ================= */

  /** 极简 YAML-ish 解析：支持 key: value、key: | 块、key: 后的 - 列表 */
  function parse(src) {
    const data = {};
    const lines = src.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1];
      let val = m[2];

      if (val === '|' || val === '>') {          // 多行块
        const buf = [];
        i++;
        while (i < lines.length && (/^\s{2,}/.test(lines[i]) || lines[i].trim() === '')) {
          if (lines[i].trim() !== '') buf.push(lines[i].replace(/^\s{2}/, ''));
          i++;
        }
        data[key] = buf.join('\n');
        continue;
      }

      if (val === '') {                          // 列表
        const buf = [];
        i++;
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*-\s+/, '').trim());
          i++;
        }
        data[key] = buf;
        continue;
      }

      data[key] = val.trim();
      i++;
    }
    return data;
  }

  /** 从 markdown 里抽出所有 quiz 块 */
  function extractBlocks(md) {
    const out = [];
    const re = /```quiz\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(md)) !== null) out.push(parse(m[1]));
    return out;
  }

  /* ================= 渲染 ================= */

  function render(q, index, ctx) {
    const id = ctx.key + ':' + index;
    const box = document.createElement('div');
    box.className = 'quiz';
    box.dataset.quizId = id;
    box.dataset.type = q.type || 'choice';

    const saved = getResult(id);
    if (saved) box.classList.add(saved.ok ? 'passed' : 'attempted');

    const head = document.createElement('div');
    head.className = 'quiz-head';
    const badge = ({
      choice: '选择题', fill: '填空题', code: '程序题', project: '小项目'
    })[q.type] || '练习';
    head.innerHTML = `<span class="quiz-badge">${badge}</span><span class="quiz-q">${escapeHtml(q.q || '')}</span>`;
    box.appendChild(head);

    const body = document.createElement('div');
    body.className = 'quiz-body';
    box.appendChild(body);

    const foot = document.createElement('div');
    foot.className = 'quiz-foot';
    box.appendChild(foot);

    ({
      choice: renderChoice, fill: renderFill, code: renderCode, project: renderProject
    }[q.type] || renderChoice)(q, body, foot, id, ctx);

    return box;
  }

  /* --- 选择题 --- */
  function renderChoice(q, body, foot, id, ctx) {
    const opts = q.options || [];
    const multi = String(q.multi || '').toLowerCase() === 'true';
    const answers = String(q.answer ?? '0').split(',').map(s => parseInt(s.trim(), 10));

    const list = document.createElement('div');
    list.className = 'quiz-options';
    opts.forEach((text, i) => {
      const row = document.createElement('label');
      row.className = 'quiz-opt';
      row.innerHTML =
        `<input type="${multi ? 'checkbox' : 'radio'}" name="${id}" value="${i}">` +
        `<span>${escapeHtml(text)}</span>`;
      list.appendChild(row);
    });
    body.appendChild(list);

    const btn = mkBtn('提交', 'primary');
    btn.onclick = () => {
      const picked = [...list.querySelectorAll('input:checked')].map(x => +x.value).sort();
      if (!picked.length) return toast('先选一个答案');
      const ok = picked.length === answers.length && picked.every((v, i) => v === answers[i]);
      finish(id, ok, q, foot, () => {
        list.querySelectorAll('input').forEach((inp, i) => {
          const row = inp.closest('.quiz-opt');
          if (answers.includes(i)) row.classList.add('correct');
          else if (inp.checked) row.classList.add('wrong');
          inp.disabled = true;
        });
      });
      btn.disabled = true;
    };
    foot.appendChild(btn);
  }

  /* --- 填空题 --- */
  function renderFill(q, body, foot, id, ctx) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quiz-input';
    input.placeholder = q.placeholder || '在这里填答案';
    body.appendChild(input);

    const btn = mkBtn('提交', 'primary');
    btn.onclick = () => {
      const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, '');
      const accepts = String(q.answer || '').split('|').map(norm);
      const ok = accepts.includes(norm(input.value));
      input.disabled = true;
      input.classList.add(ok ? 'correct' : 'wrong');
      finish(id, ok, q, foot, () => {
        if (!ok) {
          const tip = document.createElement('div');
          tip.className = 'quiz-answer';
          tip.textContent = '参考答案：' + String(q.answer).split('|')[0];
          body.appendChild(tip);
        }
      });
      btn.disabled = true;
    };
    foot.appendChild(btn);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
  }

  /* --- 程序题：真跑 assert --- */
  function renderCode(q, body, foot, id, ctx) {
    const starter = q.starter || '';
    const tests = q.tests || [];

    const wrap = document.createElement('div');
    wrap.className = 'quiz-code';

    const ta = document.createElement('textarea');
    ta.className = 'quiz-ta';
    ta.spellcheck = false;
    ta.value = starter;
    wrap.appendChild(ta);
    body.appendChild(wrap);

    const out = document.createElement('div');
    out.className = 'quiz-out';
    body.appendChild(out);

    const btnRun = mkBtn('▶ 运行并检查', 'primary');
    const btnHint = mkBtn('提示', 'ghost');
    const btnReset = mkBtn('还原初始代码', 'ghost');

    btnReset.onclick = () => { ta.value = starter; out.className = 'quiz-out'; out.textContent = ''; };
    btnHint.onclick = () => {
      out.className = 'quiz-out show hint';
      out.textContent = '💡 ' + (q.hint || '再读一遍上面的示例代码，注意函数要用 return 把结果返回出去。');
    };

    btnRun.onclick = async () => {
      btnRun.disabled = true;
      btnRun.textContent = '检查中…';
      out.className = 'quiz-out show';
      out.textContent = '正在运行…';

      const nsKey = 'quiz:' + id;
      const r = await Runner.execWithTests(ta.value, tests, nsKey);

      if (r.ok) {
        out.className = 'quiz-out show ok';
        out.textContent = '✅ 全部通过！' + (r.stdout ? '\n' + r.stdout : '');
        finish(id, true, q, foot, null);
        btnRun.textContent = '已通过';
      } else {
        out.className = 'quiz-out show err';
        out.textContent = '❌ ' + (r.error || '没有通过') + (r.stdout ? '\n\n输出：\n' + r.stdout : '');
        finish(id, false, q, foot, null);
        btnRun.disabled = false;
        btnRun.textContent = '再试一次';
      }
    };

    foot.appendChild(btnRun);
    if (q.hint) foot.appendChild(btnHint);
    foot.appendChild(btnReset);

    const saved = getResult(id);
    if (saved && saved.ok) { btnRun.textContent = '已通过（可再跑一次）'; btnRun.disabled = false; }
  }

  /* --- 小项目：验收清单自评 --- */
  function renderProject(q, body, foot, id, ctx) {
    const checks = q.checklist || q.checks || [];
    if (typeof checks === 'string') checks = [checks];

    const list = document.createElement('div');
    list.className = 'quiz-checks';
    const boxes = [];
    checks.forEach(text => {
      const row = document.createElement('label');
      row.className = 'quiz-check';
      row.innerHTML = `<input type="checkbox"><span>${escapeHtml(text)}</span>`;
      list.appendChild(row);
      boxes.push(row.querySelector('input'));
    });
    body.appendChild(list);

    const ta = document.createElement('textarea');
    ta.className = 'quiz-ta';
    ta.placeholder = '把你的代码粘在这里（可选，留个纪念）';
    body.appendChild(ta);

    const btn = mkBtn('我完成了', 'primary');
    btn.onclick = () => {
      const done = boxes.filter(b => b.checked).length;
      if (done < boxes.length) return toast(`还有 ${boxes.length - done} 项没勾，先自己验收一遍`);
      finish(id, true, q, foot, null);
      btn.textContent = '已完成 ✅';
      btn.disabled = true;
      ta.disabled = true;
    };
    foot.appendChild(btn);

    const saved = getResult(id);
    if (saved && saved.ok) { btn.textContent = '已完成 ✅'; btn.disabled = true; }
  }

  /* ================= 结果 ================= */

  function getResult(id) {
    const all = Store.get(Store.K.QUIZ, {}) || {};
    return all[id] || null;
  }

  function finish(id, ok, q, foot, decorate) {
    Store.update(Store.K.QUIZ, {}, all => {
      const prev = all[id];
      all[id] = {
        ok,
        tries: (prev?.tries || 0) + 1,
        at: new Date().toISOString()
      };
      return all;
    });
    if (decorate) decorate();

    // 解释文字
    if (q.explain) {
      const ex = document.createElement('div');
      ex.className = 'quiz-explain';
      ex.innerHTML = '<b>' + (ok ? '对了。' : '再看看。') + '</b> ' + escapeHtml(q.explain);
      foot.parentElement.insertBefore(ex, foot);
    }
    foot.parentElement.classList.remove('passed', 'attempted');
    foot.parentElement.classList.add(ok ? 'passed' : 'attempted');

    // 通知外部：进度、复习调度
    document.dispatchEvent(new CustomEvent('quiz:done', { detail: { id, ok } }));
  }

  /* ================= 工具 ================= */
  function mkBtn(text, cls) {
    const b = document.createElement('button');
    b.className = 'qbtn ' + cls;
    b.textContent = text;
    return b;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(m) { window.__toast && window.__toast(m); }

  return { extractBlocks, render, getResult };
})();
