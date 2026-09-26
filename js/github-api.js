/**
 * GitHub REST API 封装（浏览器直连，无需后端）
 *
 * 设计要点（沿用 GitHub Drive 的实践）：
 * 1. 一切走 Contents API —— 提交由 GitHub 自动生成，不必自己管理 tree/commit/blob，
 *    也就避开了手动维护分支引用带来的各种缓存问题。
 * 2. 更新文件必须先取 sha，409 冲突就重取 sha 重试。
 * 3. base64 解码必须按字节走 UTF-8，否则中文笔记会乱码。
 */
class GitHubAPI {
  constructor(token) {
    this.token = (token || '').trim();
    this.base = 'https://api.github.com';
  }

  _headers(extra = {}) {
    return Object.assign({
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    }, extra);
  }

  async _req(method, path, body = null, opts = {}) {
    const url = path.startsWith('http') ? path : this.base + path;
    const res = await fetch(url, {
      method,
      headers: this._headers(opts.headers),
      body: body === null ? undefined : JSON.stringify(body)
    });

    if (res.status === 204) return null;

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }

    if (!res.ok) {
      const err = new Error(data?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** 校验 token、取用户名 */
  async getUsername() {
    const u = await this._req('GET', '/user');
    return u.login;
  }

  /** 仓库是否存在 */
  async getRepository(owner, repo) {
    return this._req('GET', `/repos/${owner}/${repo}`);
  }

  /** 创建仓库（笔记仓库用 private: true） */
  async createRepository(name, { description = '', private: isPrivate = true, autoInit = true } = {}) {
    return this._req('POST', '/user/repos', {
      name, description, private: isPrivate, auto_init: autoInit
    });
  }

  /** 读文件，返回 { content(原文), sha, ... }；404 返回 null */
  async getFileContents(owner, repo, path, ref = 'main') {
    try {
      const d = await this._req('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}${this._cacheBuster()}`);
      if (!d || typeof d !== 'object') return null;
      return { content: GitHubAPI.decodeBase64(d.content || ''), sha: d.sha, path: d.path };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /** 创建或更新文件；sha 为空表示新建 */
  async createOrUpdateFile(owner, repo, path, content, message, branch = 'main', sha = null) {
    const body = {
      message,
      content: GitHubAPI.encodeBase64(content),
      branch
    };
    if (sha) body.sha = sha;
    return this._req('PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, body);
  }

  /** 仓库默认分支名（有的仓库是 master） */
  async getDefaultBranch(owner, repo) {
    const r = await this.getRepository(owner, repo);
    return r?.default_branch || 'main';
  }

  /** 列出某个用户的仓库名，用于判断笔记仓库是否已存在 */
  async listRepoNames(perPage = 100) {
    const r = await this._req('GET', `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner`);
    return (r || []).map(x => x.name);
  }

  _cacheBuster() {
    return `&t=${Date.now()}`;
  }

  /* ---- base64：必须按字节处理，保证中文不乱码 ---- */
  static encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000; // 分块避免 apply 参数过多爆栈
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  static decodeBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
}
