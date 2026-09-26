# 🐍 Python 从零到进阶

一个**能跑代码、能记笔记、会催你复习**的中文 Python 教程站。纯静态，托管在 GitHub Pages，不需要任何后端。

**👉 [在线阅读](https://cool-zimo.github.io/python-tutorial/)**

---

## 它和别的教程有什么不一样

| 常见教程 | 这里 |
|---|---|
| 代码只能看，得自己复制到别处跑 | **页面里直接运行**，改一行马上看结果 |
| 看完就忘，没有复习机制 | **艾宾浩斯曲线**自动安排复习，到点提醒 |
| 笔记记在别处，和课程对不上 | **每节一个笔记区**，自动同步到你的私有仓库 |
| 换台设备，进度全丢 | 进度、笔记、复习计划**跨设备同步** |
| 学起来停不下来，眼睛先废 | **节奏守护**：连续 45 分钟、单日 3 小时自动打断 |

## 四个核心特性

### 1. 浏览器里真跑 Python

用 **Pyodide** —— 真正的 CPython 编译成 WebAssembly，在你自己的浏览器里执行，不上传服务器。

- 不是简化版，`import math`、`sys.version` 都能用
- 手机、平板、电脑，打开就跑
- 每段代码都能改、都能运行、都能重置

### 2. 每节小测 + 每章大测

- **小测验（程序题）**：写完代码点「运行并检查」，后台真跑 `assert`，通过了才算会
- **大测验**：选择题（概念）+ 算法题（思维）+ 小项目（动手）三合一
- 判分全在本地完成，不上传答案

### 3. 艾宾浩斯复习调度

学完一课 → 自动进入复习队列：

```
1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天 → 毕业 🎓
```

- 复习通过：进入下一档
- 复习没过：退回 1 天档重来
- 侧栏实时显示「今日待复习 N 课」
- 依据：记忆在"快要忘掉的那一刻"复习收益最大，分散学习远优于集中填鸭

### 4. 学习节奏守护

- **连续活跃 45 分钟** → 弹窗提醒站起来走走
- **单日累计 3 小时** → 更强提醒，建议收工
- 只统计**真实活跃时间**（页面可见且 90 秒内有交互），挂机不计
- 休息不是浪费时间 —— 记忆的巩固发生在你不学习的时候

---

## 笔记与同步

笔记、进度、答题记录、复习计划存在**你自己的 GitHub 私有仓库**里（默认 `python-tutorial-notes`），不是本站的数据库。

**怎么用：**

1. 打开 [GitHub → Personal access tokens](https://github.com/settings/personal-access-tokens)
2. 生成一个 **Fine-grained token**，只勾 `Contents: Read and write`
3. 粘贴进网站的设置面板

之后换手机、换电脑、清缓存，都能一键恢复。

**为什么用私有仓库而不是后端数据库：**
纯静态站也能持久化；数据归你自己所有，本仓库看不到你的任何笔记；GitHub 天然帮你做了备份和版本管理。

同步采用**逐条 LWW（最后写入优先）**合并，而不是整包覆盖 —— 手机上记的 A 节笔记和电脑上记的 B 节笔记不会互相抹掉。复习计划则取进度更深的那一侧。

---

## 书单

| 阶段 | 书目 | 状态 |
|---|---|---|
| 基础 | 详细基础 1 · 从零开始，把每一行都讲透 | ✅ 更新中 |
| 基础 | 详细基础 2 · 数据结构与函数 | 🚧 |
| 基础 | 详细基础 3 · 文件、异常、模块与面向对象 | 🚧 |
| 基础 | 精简基础 · 学习篇（两天过一遍） | 🚧 |
| 基础 | 精简基础 · 巩固篇（题目驱动） | 🚧 |
| 数据 | 数据分析 1 · NumPy 与数组思维 | 🚧 |
| 数据 | 数据分析 2 · pandas 与表格处理 | 🚧 |
| 数据 | 数据分析 3 · 可视化与实战 | 🚧 |
| 桌面 | 窗口入门 1 · tkinter 基础 | 🚧 |
| 桌面 | 窗口入门 2 · tkinter 进阶与 pygame | 🚧 |
| 桌面 | 窗口入门 3 · 完整桌面项目 | 🚧 |
| 桌面 | 窗口进阶 1 · PyQt / PySide 核心 | 🚧 |
| 桌面 | 窗口进阶 2 · Qt 高级主题与发布 | 🚧 |
| 工程 | Python 工程实践 · 从会写到能交付 | 🚧 |

每本书的结构：**章 → 课**，每课一个小测验，每章一个大测验。

---

## 项目结构

```
index.html                     单页应用入口
css/style.css                  样式（含深色模式、移动端适配）
js/
  app.js                       路由与主控
  markdown.js                  Markdown 渲染 + 代码块/题目抽取
  quiz.js                      题目引擎（选择/填空/程序/项目）
  runner.js                    Pyodide 执行器
  codeblock.js                 可运行代码块
  godbolt.js                   Compiler Explorer 链接构造
  review.js                    艾宾浩斯复习调度
  guardian.js                  学习节奏守护
  notes.js                     笔记面板
  storage.js                   localStorage 封装
  github-api.js                GitHub REST API
  config-sync.js               跨设备同步（LWW 合并）
content/
  books.json                   书单
  books/{bookId}/toc.json      目录
  books/{bookId}/lessons/*.md  课文与大测验
```

## 课文怎么写的

课文是普通 Markdown，两个特殊围栏：

**可运行代码块**（普通 ```python 围栏自动变成可运行）：

````markdown
```python
print("你好")
```
````

**题目**（```quiz 围栏）：

````markdown
```quiz
type: code
q: 写一个函数 double(x)，返回 x 的两倍
starter: |
  def double(x):
      # 在这里写
tests:
- assert double(3) == 6
- assert double(0) == 0
hint: 用 return 把结果送出去
explain: 函数的"返回"和"打印"是两回事
```
````

题型：`choice`（选择）、`fill`（填空）、`code`（程序题）、`project`（小项目）。

程序题的测试里可以用 `__out` 拿到用户代码的输出：

```yaml
tests:
- assert "你好" in __out
```

---

## 本地预览

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

需要 HTTP 服务，直接双击 `index.html` 会因为 `fetch` 的同源策略读不到 `content/`。

## 技术栈

零构建、零依赖打包。浏览器原生 ES + CDN 上的 Pyodide / marked / DOMPurify。

---

## License

MIT
