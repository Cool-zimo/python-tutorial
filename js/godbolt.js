/**
 * Compiler Explorer（Godbolt）集成
 *
 * 原理：CE 官方支持 GET /clientstate/<base64> —— 把 ClientState JSON 做 base64
 * 编码直接拼在 URL 上，就能还原出一个预设好的会话（语言、源码、编译器、执行器）。
 * 文档：https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md
 *
 * 好处：不发 POST、不占后端、不依赖 CORS，纯静态站就能"定制"出一块 CE。
 * 风险兜底：若 CE 拒绝被 iframe 嵌入（X-Frame-Options），这里会自动降级到
 *           Pyodide 本地内核，并保留一个「新窗口打开」的入口（100% 可用）。
 */
const Godbolt = (() => {
  // CE 上 Python 执行器的编译器 id。若 CE 版本变动导致不匹配，
  // 改这里即可；CE 对无效 id 会自动回退到该语言的默认编译器。
  const PY_ID = 'python3';
  const CE_BASE = 'https://godbolt.org';

  /** UTF-8 安全的 base64 */
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  /** URL 里 + / = 必须转义，否则会被当成路径或截断 */
  function b64url(str) {
    return b64(str).replace(/\+/g, '%2B').replace(/\//g, '%2F').replace(/=/g, '%3D');
  }

  /**
   * 构造 ClientState
   * compilers 留空 => 不显示汇编面板（Python 也不需要）
   * executors 带 compiler => 打开即运行，直接看到 stdout
   */
  function buildState(code, { readonly = false } = {}) {
    return {
      sessions: [{
        id: 1,
        language: 'python',
        source: code,
        compilers: [],
        executors: [{
          compiler: { id: PY_ID, libs: [], options: '' },
          arguments: '',
          stdin: ''
        }]
      }]
    };
  }

  /** 完整 CE 链接（新窗口打开用这个） */
  function buildUrl(code, opts) {
    return `${CE_BASE}/clientstate/${b64url(JSON.stringify(buildState(code, opts)))}`;
  }

  /**
   * 在容器里嵌入一个 CE 面板
   * 返回 Promise<boolean>：true=嵌入成功，false=被拒绝（调用方应降级）
   */
  function embed(container, code) {
    return new Promise(resolve => {
      container.innerHTML = '';
      const f = document.createElement('iframe');
      f.setAttribute('title', 'Compiler Explorer');
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      f.style.cssText = 'width:100%;height:420px;border:0;display:block;background:var(--bg-panel)';
      f.src = buildUrl(code);
      container.appendChild(f);

      let settled = false;
      const finish = ok => { if (!settled) { settled = true; resolve(ok); } };

      // 乐观：3.5 秒内没触发 load 事件就认为被拦（被 X-Frame-Options 拒绝时
      // iframe 仍会 load，但内容是空白/错误页，故再配合一次可见性检查）
      f.addEventListener('load', () => setTimeout(() => finish(true), 400));
      f.addEventListener('error', () => finish(false));
      setTimeout(() => { if (!settled) finish(false); }, 6000);
    });
  }

  return { buildUrl, embed, PY_ID };
})();
