/**
 * 学习节奏守护
 *
 * 两道闸门，都是基于「活跃时间」而不是挂机时间：
 *   闸门一 · 连续 45 分钟 —— 注意力与睫状肌的极限，必须站起来走走。
 *   闸门二 · 单日累计 3 小时 —— 一天灌太多，记忆留存反而下降
 *           （艾宾浩斯早就证明：分散学习 > 集中填鸭）。
 *
 * 活跃判定：页面可见 且 90 秒内有真实交互（滚动 / 点击 / 键盘 / 运行代码）。
 * 挂机、切后台、锁屏都不计入。
 */
const Guardian = (() => {

  const CONTINUOUS_LIMIT = 45 * 60 * 1000;   // 连续 45 分钟
  const DAILY_LIMIT = 3 * 60 * 60 * 1000;    // 单日 3 小时
  const IDLE_GAP = 90 * 1000;                // 超过 90 秒没动静算不活跃
  const TICK = 30 * 1000;                    // 每 30 秒检查一次

  const K = Store.K.GUARD;
  let timer = null;
  let paused = false;          // 提醒弹窗打开时不计时
  let onBreak = null;

  function state() {
    const today = new Date().toDateString();
    let s = Store.get(K, null);
    if (!s || s.date !== today) {
      // 跨天：累计清零，连续时长也重置
      s = { date: today, dayTotal: 0, session: 0, lastActive: 0, breaks: 0 };
      Store.set(K, s);
    }
    return s;
  }

  function persist(s) { Store.set(K, s); }

  /** 记一次活跃：把「距上次活跃」的间隙补进计时器（超过 IDLE_GAP 的不算） */
  function ping() {
    if (paused) return;
    const s = state();
    const now = Date.now();
    if (s.lastActive) {
      const gap = now - s.lastActive;
      if (gap < IDLE_GAP) {
        s.session += gap;
        s.dayTotal += gap;
      } else {
        s.session = 0;          // 离开太久，连续计时归零
      }
    }
    s.lastActive = now;
    persist(s);
  }

  function tick() {
    if (paused || document.visibilityState !== 'visible') return;
    const s = state();
    const now = Date.now();

    // 没在动：不累加，但也不清零（等用户回来再判断）
    if (now - (s.lastActive || 0) < IDLE_GAP) {
      s.session += TICK;
      s.dayTotal += TICK;
      s.lastActive = now;
      persist(s);
    } else if (s.session > 0) {
      // 静默超过 90 秒，视为已休息，连续计时清零
      s.session = 0;
      persist(s);
    }

    check(s);
  }

  function check(s) {
    if (s.dayTotal >= DAILY_LIMIT) {
      fire('daily', s);
    } else if (s.session >= CONTINUOUS_LIMIT) {
      fire('continuous', s);
    }
  }

  function fire(kind, s) {
    paused = true;
    s.session = 0;       // 打断后重新开始计连续时长
    s.breaks = (s.breaks || 0) + 1;
    persist(s);
    if (onBreak) onBreak(kind, {
      dayTotal: s.dayTotal,
      breaks: s.breaks
    });
  }

  /** 用户点了「去休息」：真正暂停 10 分钟计时 */
  function takeBreak(minutes = 10) {
    paused = true;
    setTimeout(() => { paused = false; }, minutes * 60 * 1000);
    const s = state();
    s.lastActive = 0;
    s.session = 0;
    persist(s);
  }

  /** 用户选择继续（记一笔，但不强迫） */
  function resume() {
    paused = false;
    const s = state();
    s.lastActive = Date.now();
    s.session = 0;
    persist(s);
  }

  function fmt(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h} 小时 ${m % 60} 分` : `${m} 分钟`;
  }

  function start(breakCallback) {
    onBreak = breakCallback;

    ['scroll', 'click', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, ping, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ping();
    });
    // 运行代码也算活跃
    document.addEventListener('quiz:done', ping);

    clearInterval(timer);
    timer = setInterval(tick, TICK);
    ping();
  }

  return {
    start, takeBreak, resume, ping, fmt,
    state,
    LIMITS: { CONTINUOUS_LIMIT, DAILY_LIMIT }
  };
})();
