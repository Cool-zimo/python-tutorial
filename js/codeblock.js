/**
 * 可运行代码块
 *
 * 双引擎设计（重要）：
 *   🐍 本地内核 —— Pyodide，浏览器内 WASM 版 CPython。
 *      优点：断网可用、秒开、中文报错、同节内变量互通（适合教学连贯性）。
 *   ⚙️ Compiler Explorer —— 真实 CPython 沙箱（Godbolt）。
 *      优点：真机环境、可选 Python 版本、还能看字节码/汇编，适合进阶验证。
 *
 * 默认用本地内核（移动端友好）；用户切过一次后会记住选择。
 */
const CodeBlock = (() => {
  const ENGINE_KEY = 'engine';
  let preferred = localStorage.getItem('pytut:engine') || 'pyodide';

  function create(code, lessonId) {
    const original = code;
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';

    const head = document.createElement('div');
    head.className = 'codeblock-head';
    head.innerHTML = `<span class="lang">python</span><span class="spacer"></span>`;
    wrap.appendChild(head);

    const btnEdit = mkBtn('编辑', 'btn-edit');
    const btnRun = mkBtn('▶ 运行', 'btn-run');
    const btnCopy = mkBtn('复制', 'btn-copy');
    const btnReset = mkBtn('还原', 'btn-reset');
    btnReset.style.display = 'none';
    const btnCE = mkBtn('Godbolt ↗', 'btn-copy');
    btnCE.title = '在新标签页用 Compiler Explorer 打开这段代码';

    head.appendChild(btnRun);
    head.appendChild(btnEdit);
    head.appendChild(btnCopy);
    head.appendChild(btnReset);
    head.appendChild(btnCE);

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    wrap.appendChild(pre);

    const ta = document.createElement('textarea');
    ta.value = code;
    ta.spellcheck = false;
    wrap.appendChild(ta);

    const out = document.createElement('div');
    out.className = 'runout';
    wrap.appendChild(out);

    /* --- 编辑 / 还原 --- */
    btnEdit.onclick = () => {
      const editing = wrap.classList.toggle('editing');
      btnEdit.textContent = editing ? '完成' : '编辑';
      btnReset.style.display = editing ? '' : 'none';
      if (editing) { ta.focus(); }
      else { codeEl.textContent = ta.value; }
    };
    btnReset.onclick = () => { ta.value = original; codeEl.textContent = original; ta.focus(); };
    btnCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        btnCopy.textContent = '已复制';
        setTimeout(() => btnCopy.textContent = '复制', 1500);
      } catch (e) { toast('复制失败，请手动选择'); }
    };
    btnCE.onclick = () => window.open(Godbolt.buildUrl(ta.value), '_blank', 'noopener');

    /* --- 输出区 --- */
    const writer = {
      write(cls, text) {
        out.classList.add('show');
        const span = document.createElement('span');
        span.className = cls || '';
        span.textContent = text;
        out.appendChild(span);
      },
      end(ms) {
        if (ms) {
          const s = document.createElement('span');
          s.className = 'ok';
          s.textContent = `— 运行完毕 ${ms} ms`;
          out.appendChild(s);
        }
        btnRun.classList.remove('running');
        btnRun.disabled = false;
        btnRun.textContent = '▶ 运行';
      }
    };

    /* --- 运行 --- */
    btnRun.onclick = async () => {
      out.innerHTML = '';
      out.classList.add('show');
      btnRun.classList.add('running');
      btnRun.disabled = true;
      btnRun.textContent = '运行中…';
      const src = ta.value;

      if (preferred === 'godbolt') {
        writer.write('sys', '正在加载 Compiler Explorer…\n');
        const ok = await Godbolt.embed(out, src);
        if (ok) { writer.end(0); return; }
        writer.write('sys', '嵌入失败（可能是网络或 CE 限制），已自动切换到本地内核\n');
      }
      await Runner.run(src, lessonId, writer);
    };

    return wrap;
  }

  function mkBtn(text, cls) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = text;
    return b;
  }

  function toast(m) { window.__toast && window.__toast(m); }

  return {
    create,
    get engine() { return preferred; },
    set engine(v) {
      preferred = v;
      localStorage.setItem('pytut:' + ENGINE_KEY, v);
    }
  };
})();
