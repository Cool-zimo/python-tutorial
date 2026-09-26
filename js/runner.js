/**
 * Python 代码执行器（Pyodide，纯浏览器内）
 *
 * 关键设计：
 * - 懒加载：只有第一次点「运行」才去 CDN 拉内核（约 10MB），不拖慢首屏。
 * - 命名空间按「节」隔离：同一节内多个代码块共享变量（前面的定义后面能用），
 *   切到下一节自动重置，避免上一节的变量污染教学效果。
 * - stdout / stderr 重定向到页面上的输出区，input() 通过一个输入框批量喂入。
 */
const Runner = (() => {
  let pyodide = null;
  let loading = null;
  let ns = null;          // 当前节的 globals
  let nsOwner = null;     // 当前命名空间属于哪一节
  let stdinQueue = [];
  const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';

  async function ensure() {
    if (pyodide) return pyodide;
    if (loading) return loading;
    loading = (async () => {
      if (typeof loadPyodide !== 'function') {
        throw new Error('Pyodide 脚本未加载成功，请检查网络');
      }
      pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
      pyodide.setStdin({
        stdin: () => (stdinQueue.length ? stdinQueue.shift() + '\n' : '\n'),
        autoEOF: true
      });
      return pyodide;
    })();
    return loading;
  }

  /** 切换章节：重置命名空间 */
  function resetNamespace(lessonId) {
    if (!pyodide || nsOwner === lessonId) return;
    ns = pyodide.runPython('{}');   // 新建空的 globals dict
    nsOwner = lessonId;
  }

  /** 收集 input() 需要的内容 */
  function collectStdin(code, out) {
    const count = (code.match(/(^|[^.\w])input\s*\(/g) || []).length;
    if (!count) return true;
    const ans = prompt(`这段代码调用了 ${count} 次 input()\n请按顺序列出每行要输入的内容（多行）：`);
    if (ans === null) { out.write('sys', '（已取消运行）\n'); return false; }
    stdinQueue = ans.split('\n');
    return true;
  }

  /**
   * 执行代码
   * @param {string} code
   * @param {string} lessonId
   * @param {{write:(cls:string,text:string)=>void, end:(ms:number)=>void}} out
   */
  async function run(code, lessonId, out) {
    try {
      await ensure();
    } catch (e) {
      out.write('err', '运行环境加载失败：' + e.message + '\n（多半是网络问题，刷新页面重试）');
      out.end(0);
      return;
    }
    try {
      resetNamespace(lessonId);

      let buf = '';
      pyodide.setStdout({ batched: s => { buf += s + '\n'; out.write('', s + '\n'); } });
      pyodide.setStderr({ batched: s => { out.write('err', s + '\n'); } });

      if (!collectStdin(code, out)) { out.end(0); return; }

      const t0 = performance.now();
      // 用独立 globals，让同一节内变量互通、不同节互不干扰
      const result = pyodide.runPython(code, { globals: ns });

      const ms = Math.round(performance.now() - t0);
      // 最后一行是表达式时，回显其值（REPL 体验）
      if (result !== undefined && result !== null) {
        try {
          const rep = pyodide.globals.get('repr')(result);
          if (rep && rep !== 'None') out.write('', '→ ' + rep + '\n');
        } catch (e) { /* 某些对象无法 repr，忽略 */ }
      }
      out.end(ms);
    } catch (e) {
      // Python 异常信息里含调用栈，直接展示更有教学价值
      out.write('err', String(e.message || e));
      out.end(0);
    }
  }

  /**
   * 结构化执行：给测试引擎用
   * @param {string} code 用户代码
   * @param {string[]} tests 断言语句数组，如 ["assert add(1,2)==3"]
   * @param {string} nsKey 命名空间钥匙（同一课内共享）
   * @returns {Promise<{ok:boolean, stdout:string, error:string|null, failed:number}>}
   */
  async function execWithTests(code, tests, nsKey = '__quiz__') {
    const result = { ok: false, stdout: '', error: null, failed: 0 };
    try {
      await ensure();
    } catch (e) {
      result.error = '运行环境加载失败：' + e.message;
      return result;
    }
    if (nsOwner !== nsKey || !ns) {
      ns = pyodide.runPython('{}');
      nsOwner = nsKey;
    }
    let buf = '';
    pyodide.setStdout({ batched: s => { buf += s + '\n'; } });
    pyodide.setStderr({ batched: s => { buf += s + '\n'; } });

    try {
      pyodide.runPython(code, { globals: ns });
    } catch (e) {
      result.error = String(e.message || e);
      result.stdout = buf;
      return result;
    }

    // 把用户代码的输出暴露成变量 __out，
    // 这样测试就能写 assert "xxx" in __out，用来验证"打印了什么"
    try { ns.set('__out', buf); } catch (e) { /* 某些 proxy 不支持 set，忽略 */ }

    for (let i = 0; i < tests.length; i++) {
      try {
        pyodide.runPython(tests[i], { globals: ns });
      } catch (e) {
        result.failed = i + 1;
        // AssertionError 通常不带消息，补一句人话
        const raw = String(e.message || e).trim();
        result.error = raw || `第 ${i + 1} 个测试没有通过`;
        result.stdout = buf;
        return result;
      }
    }
    result.ok = true;
    result.stdout = buf;
    return result;
  }

  return { run, execWithTests, ensure, resetNamespace, get ready() { return !!pyodide; } };
})();
