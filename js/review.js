/**
 * 艾宾浩斯复习调度
 *
 * 模型：简化版间隔重复（spaced repetition）。
 * 学完的那一刻记住 100%，如果不复习，记忆会按指数衰减 ——
 * 所以「在快要忘掉的那一刻复习」收益最大，这就是间隔的意义。
 *
 * 间隔序列（天）：1 → 2 → 4 → 7 → 15 → 30 → 60 → 毕业
 * 复习通过：进入下一档；复习没通过：退回 1 天档重来。
 *
 * 数据存 localStorage，并随笔记一起同步到私有仓库（多设备共享复习计划）。
 */
const Review = (() => {

  // 艾宾浩斯经典复习点，单位：天
  const INTERVALS = [1, 2, 4, 7, 15, 30, 60];
  const DAY = 86400000;

  function all() {
    return Store.get(Store.K.REVIEW, {}) || {};
  }

  function save(obj) {
    return Store.set(Store.K.REVIEW, obj);
  }

  /** 学完一课：加入复习队列，第一次复习安排在 1 天后 */
  function learn(key) {
    const r = all();
    if (r[key] && r[key].stage >= 0) return r[key];   // 已在队列里就不重置
    r[key] = {
      stage: 0,
      due: Date.now() + INTERVALS[0] * DAY,
      learnedAt: new Date().toISOString(),
      lastOk: null,
      history: []
    };
    save(r);
    return r[key];
  }

  /** 取消完成：从队列移除 */
  function unlearn(key) {
    const r = all();
    delete r[key];
    save(r);
  }

  /**
   * 复习结果回写
   * @param {string} key 课的唯一标识（bookId:lessonId）
   * @param {boolean} ok 是否全部做对
   */
  function record(key, ok) {
    const r = all();
    const item = r[key] || learn(key);
    item.history = (item.history || []).slice(-19);
    item.history.push({ at: Date.now(), ok });
    item.lastOk = ok;

    if (ok) {
      item.stage = Math.min((item.stage || 0) + 1, INTERVALS.length);
    } else {
      // 没通过：退回上一档，但最少也要 1 天后再来（避免当天死磕）
      item.stage = Math.max(0, (item.stage || 0) - 1);
    }
    const graduated = item.stage >= INTERVALS.length;
    item.due = graduated ? null : Date.now() + INTERVALS[item.stage] * DAY;
    item.graduated = graduated;

    r[key] = item;
    save(r);
    return item;
  }

  /** 今天该复习的课（含逾期） */
  function dueList() {
    const r = all();
    const now = Date.now();
    return Object.keys(r)
      .filter(k => r[k].due && r[k].due <= now)
      .sort((a, b) => r[a].due - r[b].due)
      .map(k => ({ key: k, ...r[k] }));
  }

  /** 未来 N 天预告，用于生成复习日历 */
  function upcoming(days = 7) {
    const r = all();
    const now = Date.now();
    const end = now + days * DAY;
    return Object.keys(r)
      .filter(k => r[k].due && r[k].due > now && r[k].due <= end)
      .map(k => ({ key: k, ...r[k] }))
      .sort((a, b) => a.due - b.due);
  }

  function stats() {
    const r = all();
    const keys = Object.keys(r);
    return {
      total: keys.length,
      due: dueList().length,
      graduated: keys.filter(k => r[k].graduated).length,
      inProgress: keys.filter(k => !r[k].graduated).length
    };
  }

  /** 人类可读的下次复习时间 */
  function humanDue(due) {
    if (!due) return '已毕业 🎓';
    const diff = due - Date.now();
    if (diff <= 0) return '现在就该复习';
    const d = Math.round(diff / DAY);
    if (d <= 1) return '今天晚些时候';
    return `${d} 天后`;
  }

  /** 当前处在第几档（用于展示进度点） */
  function stageLabel(stage) {
    if (stage >= INTERVALS.length) return '已毕业';
    return `第 ${stage + 1} 轮 · ${INTERVALS[stage]} 天后`;
  }

  return { learn, unlearn, record, dueList, upcoming, stats, humanDue, stageLabel, INTERVALS };
})();
