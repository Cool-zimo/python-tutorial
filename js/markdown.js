/**
 * Markdown 渲染 + 代码块提取
 * 优先用 marked（CDN），失败时退回内置精简渲染器，保证离线也能读。
 * 渲染后用 DOMPurify 清洗，防止内容注入。
 */
const MD = (() => {

  /** 把 Markdown 里的围栏块抽出来：普通代码进 blocks，题目进 quizzes */
  function extract(md) {
    const blocks = [];
    const quizzes = [];
    const out = md.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => {
      const L = (lang || 'text').toLowerCase();
      const body = code.replace(/\n$/, '');
      if (L === 'quiz') {
        const i = quizzes.length;
        quizzes.push(body);
        return `\u0000QUIZ${i}\u0000`;
      }
      const i = blocks.length;
      blocks.push({ lang: L, code: body });
      return `\u0000BLOCK${i}\u0000`;
    });
    return { md: out, blocks, quizzes };
  }

  /** 内置极简渲染器：够用、零依赖 */
  function fallbackRender(src) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let s = esc(src);

    // 行内代码先占位，避免被其他规则破坏
    const inlines = [];
    s = s.replace(/`([^`\n]+)`/g, (m, c) => {
      inlines.push(c); return `\u0000INL${inlines.length - 1}\u0000`;
    });

    const lines = s.split('\n');
    const out = [];
    let list = null, inQuote = false;

    const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const flushQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (/^\s*$/.test(line)) { flushList(); flushQuote(); continue; }

      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushList(); flushQuote();
        const lv = m[1].length;
        out.push(`<h${lv}>${m[2]}</h${lv}>`);
      } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushList(); flushQuote(); out.push('<hr>');
      } else if ((m = line.match(/^>\s?(.*)$/))) {
        flushList();
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        out.push(`<p>${m[1]}</p>`);
      } else if ((m = line.match(/^[-*+]\s+(.*)$/))) {
        flushQuote();
        if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
        out.push(`<li>${m[1]}</li>`);
      } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
        flushQuote();
        if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${m[1]}</li>`);
      } else {
        flushList(); flushQuote();
        out.push(`<p>${line}</p>`);
      }
    }
    flushList(); flushQuote();

    s = out.join('\n');
    // 行内标记
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
         .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) =>
            `<a href="${/^(https?:|#|\/)/.test(h) ? h : '#'}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`);
    // 还原行内代码
    s = s.replace(/\u0000INL(\d+)\u0000/g, (m, i) => `<code>${inlines[+i]}</code>`);
    return s;
  }

  function render(src) {
    let html;
    try {
      if (window.marked) {
        html = marked.parse(src, { gfm: true, breaks: false });
      } else {
        html = fallbackRender(src);
      }
    } catch (e) {
      console.warn('[MD] 渲染失败，使用 fallback:', e.message);
      html = fallbackRender(src);
    }
    return window.DOMPurify ? DOMPurify.sanitize(html) : html;
  }

  /**
   * 渲染一节课：抽块 -> 渲染正文 -> 占位符换成真实 UI 的挂载点
   * @returns {{html:string, blocks:Array, quizzes:Array}}
   */
  function renderLesson(src) {
    const { md, blocks, quizzes } = extract(src);

    // 让占位符独占一行，避免被塞进段落中间
    const spaced = md
      .replace(/^\u0000BLOCK(\d+)\u0000$/gm, '\n\u0000BLOCK$1\u0000\n')
      .replace(/^\u0000QUIZ(\d+)\u0000$/gm, '\n\u0000QUIZ$1\u0000\n');

    let html = render(spaced);

    html = html.replace(/<p>\u0000BLOCK(\d+)\u0000<\/p>|\u0000BLOCK(\d+)\u0000/g,
      (m, a, b) => `<div data-codeblock="${a ?? b}"></div>`);

    html = html.replace(/<p>\u0000QUIZ(\d+)\u0000<\/p>|\u0000QUIZ(\d+)\u0000/g,
      (m, a, b) => `<div data-quiz="${a ?? b}"></div>`);

    return { html, blocks, quizzes };
  }

  return { render, renderLesson, extract, parseQuiz: parseQuizText };

  /** 供外部直接用：把 quiz 文本解析成对象 */
  function parseQuizText(text) {
    const data = {};
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^(\w+)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1], val = m[2];
      if (val === '|' || val === '>') {
        const buf = []; i++;
        while (i < lines.length && (/^\s{2,}/.test(lines[i]) || lines[i].trim() === '')) {
          if (lines[i].trim() !== '') buf.push(lines[i].replace(/^\s{2}/, ''));
          i++;
        }
        data[key] = buf.join('\n');
        continue;
      }
      if (val === '') {
        const buf = []; i++;
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*-\s+/, '').trim()); i++;
        }
        data[key] = buf;
        continue;
      }
      data[key] = val.trim(); i++;
    }
    return data;
  }
})();
