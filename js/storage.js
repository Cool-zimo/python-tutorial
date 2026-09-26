/**
 * 本地存储封装
 * - 统一命名空间，避免与其他同源页面冲突
 * - 所有写入立即落 localStorage（保证刷新/离线不丢）
 * - 跨设备的持久同步由 ConfigSync 负责，这里只管本机
 */
const Store = (() => {
  const NS = 'pytut:';
  const mem = new Map();

  function read(key, fallback = null) {
    if (mem.has(key)) return mem.get(key);
    let v = fallback;
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw !== null) v = JSON.parse(raw);
    } catch (e) { /* 解析失败则用默认值 */ }
    mem.set(key, v);
    return v;
  }

  function write(key, value) {
    mem.set(key, value);
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) {
      console.warn('[Store] 写入失败（可能超出配额）:', e.message);
    }
    return value;
  }

  function remove(key) {
    mem.delete(key);
    try { localStorage.removeItem(NS + key); } catch (e) {}
  }

  return {
    K: {
      TOKEN: 'token',
      OWNER: 'owner',
      NOTES: 'notes',        // { [lessonKey]: { text, updatedAt } }
      PROGRESS: 'progress',  // { [lessonKey]: { done, updatedAt } }
      QUIZ: 'quiz',          // { [quizId]: { ok, tries, at } }
      REVIEW: 'review',      // { [lessonKey]: { stage, due, lastOk, history } }
      GUARD: 'guard',        // { date, dayTotal, session, lastActive, breaks }
      LAST_POS: 'lastPos',   // 上次阅读位置 { bookId, lessonId }
      SYNCED_AT: 'syncedAt',
      DARK: 'dark'
    },
    get: read,
    set: write,
    del: remove,
    /** 取出后修改再存回的便捷方法 */
    update(key, fallback, fn) {
      const cur = read(key, fallback);
      const next = fn(cur) ?? cur;
      return write(key, next);
    }
  };
})();
