/**
 * 笔记 / 进度 的跨设备同步
 *
 * 存储载体：用户自己名下的一个「私有仓库」（默认 python-tutorial-notes）里的 sync.json。
 * 为什么用私有仓库而不是 localStorage / 后端数据库：
 *   - 私有仓库：只有本人能读写，不占公开仓库、不影响 GitHub 主页观感；
 *   - 纯静态站也能持久化，GitHub Pages 天然免运维；
 *   - 换浏览器、换手机、换电脑，只要填入同一个 token 就能完整恢复。
 *
 * 冲突处理：按条目做 LWW（last-write-wins）。
 *   每条笔记 / 每个进度都带自己的 updatedAt，合并时逐条取更新的那个，
 *   而不是整包覆盖 —— 这样「手机记的 A 节笔记」和「电脑记的 B 节笔记」
 *   不会互相抹掉（GitHub Drive 那版是整包覆盖，这里做了改进）。
 */
class ConfigSync {
  constructor(api, repoName = 'python-tutorial-notes') {
    this.api = api;
    this.repoName = repoName;
    this.filePath = 'sync.json';
    this.owner = null;
    this.branch = 'main';
    this.timer = null;
    this.isSyncing = false;
    this.lastHash = '';
    this.state = 'off';
    this.onStateChange = null;
  }

  /* ---------- 状态 ---------- */
  _setState(s, text) {
    this.state = s;
    if (this.onStateChange) this.onStateChange(s, text);
  }

  /* ---------- 初始化 ---------- */
  async init() {
    try {
      this._setState('syncing', '连接中…');
      this.owner = await this.api.getUsername();
      Store.set(Store.K.OWNER, this.owner);

      await this._ensureRepo();
      this.branch = await this._detectBranch();

      const remote = await this._pull();
      if (remote) {
        this._mergeIntoLocal(remote);
        this._setState('ok', '已同步');
      } else {
        // 远端还没有文件，把本机已有内容推上去
        await this._push(true);
        this._setState('ok', '已初始化');
      }
      return true;
    } catch (e) {
      console.error('[Sync] 初始化失败', e);
      this._setState('err', e.status === 401 ? 'token 无效' : '同步失败');
      throw e;
    }
  }

  async _ensureRepo() {
    try {
      await this.api.getRepository(this.owner, this.repoName);
      return;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    // 不存在 -> 创建私有仓库
    try {
      await this.api.createRepository(this.repoName, {
        description: 'Python 教程的笔记与学习进度（自动生成，仅本人可见）',
        private: true,
        autoInit: true
      });
      await this.sleep(2500); // 等 GitHub 完成初始化
    } catch (e) {
      // 并发/重试导致的「已存在」可以忽略
      if (!/already exists|name already/i.test(e.message || '')) throw e;
    }
  }

  async _detectBranch() {
    try {
      return await this.api.getDefaultBranch(this.owner, this.repoName);
    } catch (e) { return 'main'; }
  }

  /* ---------- 拉 ---------- */
  async _pull() {
    const f = await this.api.getFileContents(this.owner, this.repoName, this.filePath, this.branch);
    if (!f || !f.content) return null;
    try {
      return JSON.parse(f.content);
    } catch (e) {
      console.warn('[Sync] 远端 JSON 解析失败，按空处理', e);
      return null;
    }
  }

  /* ---------- 推 ---------- */
  async _push(force = false) {
    if (this.isSyncing) return false;
    this.isSyncing = true;
    this._setState('syncing', '同步中…');
    try {
      const payload = this.exportPayload();
      const str = JSON.stringify(payload, null, 2);
      const hash = this._hash(str);
      if (!force && hash === this.lastHash) {
        this._setState('ok', '已是最新');
        return false;
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          let sha = null;
          try {
            const cur = await this.api.getFileContents(this.owner, this.repoName, this.filePath, this.branch);
            if (cur?.sha) sha = cur.sha;
          } catch (e) { /* 文件还不存在，将创建 */ }

          await this.api.createOrUpdateFile(
            this.owner, this.repoName, this.filePath, str,
            `更新学习记录 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
            this.branch, sha
          );

          this.lastHash = hash;
          Store.set(Store.K.SYNCED_AT, Date.now());
          this._setState('ok', `已同步 · ${this._timeNow()}`);
          return true;
        } catch (e) {
          const conflict = e.status === 409 || /does not match|Conflict/i.test(e.message || '');
          if (conflict) {
            console.warn(`[Sync] SHA 冲突，重取后重试 (${attempt + 1}/3)`);
            await this.sleep(1200);
            continue;
          }
          throw e;
        }
      }
      this._setState('err', '同步重试失败');
      return false;
    } catch (e) {
      console.error('[Sync] 推送失败', e);
      this._setState('err', e.status === 401 ? 'token 失效' : '同步失败');
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /** 防抖：变更 4 秒后自动推一次 */
  schedulePush() {
    clearTimeout(this.timer);
    this._setState('syncing', '待同步…');
    this.timer = setTimeout(() => { this._push(); }, 4000);
  }

  /** 立即同步（先拉远端合并，再推上去） */
  async syncNow() {
    try {
      const remote = await this._pull();
      if (remote) this._mergeIntoLocal(remote);
    } catch (e) {
      console.warn('[Sync] 拉取失败，直接推送', e);
    }
    return this._push(true);
  }

  /* ---------- 数据模型 ---------- */
  exportPayload() {
    const notes = Store.get(Store.K.NOTES, {}) || {};
    const progress = Store.get(Store.K.PROGRESS, {}) || {};
    const quiz = Store.get(Store.K.QUIZ, {}) || {};
    const review = Store.get(Store.K.REVIEW, {}) || {};
    // 统一成 { value, updatedAt } 结构
    const pack = (obj, key) => {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = (v && typeof v === 'object' && 'updatedAt' in v)
          ? v
          : { [key]: v, updatedAt: new Date(0).toISOString() };
      }
      return out;
    };
    return {
      version: 3,
      app: 'python-tutorial',
      updatedAt: new Date().toISOString(),
      notes: pack(notes, 'text'),
      progress: pack(progress, 'done'),
      quiz: pack(quiz, 'ok'),
      review: pack(review, 'stage')
    };
  }

  /** 逐条 LWW 合并：远端 -> 本地 */
  _mergeIntoLocal(remote) {
    if (!remote) return;
    const merge = (localObj, remoteObj, valueKey) => {
      const out = {};
      const keys = new Set([...Object.keys(localObj || {}), ...Object.keys(remoteObj || {})]);
      for (const k of keys) {
        const l = localObj?.[k];
        const r = remoteObj?.[k];
        const lv = (l && typeof l === 'object') ? l : { [valueKey]: l, updatedAt: new Date(0).toISOString() };
        const rv = (r && typeof r === 'object') ? r : { [valueKey]: r, updatedAt: new Date(0).toISOString() };
        // 空的本地笔记不应该覆盖远端有内容的
        if (!lv[valueKey] && rv[valueKey]) { out[k] = rv; continue; }
        if (!rv[valueKey] && lv[valueKey]) { out[k] = lv; continue; }
        out[k] = (new Date(rv.updatedAt || 0) > new Date(lv.updatedAt || 0)) ? rv : lv;
      }
      return out;
    };

    const localNotes = Store.get(Store.K.NOTES, {}) || {};
    const localProg = Store.get(Store.K.PROGRESS, {}) || {};

    const notes = merge(localNotes, remote.notes, 'text');
    const progress = merge(localProg, remote.progress, 'done');

    // 答题结果：按时间戳 LWW（ok=false 也是有意义的记录，不能被"空值覆盖"逻辑吃掉）
    const mergeByTime = (localObj, remoteObj, field) => {
      const out = {};
      const keys = new Set([...Object.keys(localObj || {}), ...Object.keys(remoteObj || {})]);
      for (const k of keys) {
        const l = localObj?.[k], r = remoteObj?.[k];
        if (!l) { out[k] = r; continue; }
        if (!r) { out[k] = l; continue; }
        out[k] = new Date(r[field] || 0) > new Date(l[field] || 0) ? r : l;
      }
      return out;
    };

    // 复习计划：取 stage 更深的那一侧（学习进度只前进，不后退）
    const mergeReview = (localObj, remoteObj) => {
      const out = {};
      const keys = new Set([...Object.keys(localObj || {}), ...Object.keys(remoteObj || {})]);
      for (const k of keys) {
        const l = localObj?.[k], r = remoteObj?.[k];
        if (!l) { out[k] = r; continue; }
        if (!r) { out[k] = l; continue; }
        const ls = l.stage ?? -1, rs = r.stage ?? -1;
        if (rs > ls) { out[k] = r; continue; }
        if (ls > rs) { out[k] = l; continue; }
        // stage 相同：取 due 更晚的（刚复习过的一侧信息更新）
        out[k] = (r.due || 0) > (l.due || 0) ? r : l;
      }
      return out;
    };

    const quiz = mergeByTime(Store.get(Store.K.QUIZ, {}) || {}, remote.quiz, 'at');
    const review = mergeReview(Store.get(Store.K.REVIEW, {}) || {}, remote.review);

    Store.set(Store.K.NOTES, notes);
    Store.set(Store.K.PROGRESS, progress);
    if (Object.keys(quiz).length) Store.set(Store.K.QUIZ, quiz);
    if (Object.keys(review).length) Store.set(Store.K.REVIEW, review);
    this.lastHash = this._hash(JSON.stringify(this.exportPayload(), null, 2));
  }

  /* ---------- 工具 ---------- */
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h = h & h;
    }
    return String(h);
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _timeNow() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
