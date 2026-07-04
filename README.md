# 🤖 AI Chat Web

一个纯前端 AI 对话应用，支持 OpenAI 兼容 API 的流式对话、Markdown 渲染、代码高亮、多会话管理、深色/浅色主题切换。

A pure front-end AI chat application with streaming responses, Markdown rendering, code highlighting, multi-session management, and light/dark theme support.

---

## ✨ 功能特性 | Features

- 🚀 **流式对话** — 实时 token-by-token 流式输出，支持中途停止生成
- 📝 **Markdown 渲染** — 支持标题、列表、表格、引用、链接、代码块等完整 Markdown 语法
- 🌈 **代码高亮** — 基于 highlight.js 的自动语法高亮，支持一键复制代码
- 💬 **多会话管理** — 创建、切换、重命名、删除多个独立会话
- 🌓 **主题切换** — 浅色 / 深色主题一键切换
- 🔑 **API 密钥管理** — 支持多组 API 配置（名称、密钥、Base URL、模型），可随时切换
- ⚙ **可调参数** — Temperature、Top P、Max Tokens 滑块调节；字体大小自定义
- 📋 **系统提示词** — 每个会话独立设置 AI 角色和行为
- 🔍 **消息搜索** — 会话内关键词搜索，高亮匹配并定位跳转
- 📤 **导出对话** — 将会话导出为 Markdown 文件，带时间戳
- 💾 **本地持久化** — 所有数据存储在浏览器 localStorage，无需后端
- 📱 **响应式设计** — 窄屏自动隐藏侧边栏

---

## 🛠 技术栈 | Tech Stack

| 层级 | 技术 |
|------|------|
| 结构 | HTML5 |
| 样式 | CSS3 (CSS Custom Properties 主题系统) |
| 逻辑 | Vanilla JavaScript (ES6+) |
| Markdown | [marked.js](https://github.com/markedjs/marked) |
| 代码高亮 | [highlight.js](https://highlightjs.org/) |

**零依赖构建工具，零后端，打开即用。**

---

## 🚀 快速开始 | Quick Start

### 1. 打开应用

直接用浏览器打开 `index.html` 即可，无需安装任何依赖或启动服务器。

```
双击 index.html
```

或者用任意 HTTP 服务器：

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code Live Server 插件
```

然后访问 `http://localhost:8080`

### 2. 配置 API

1. 点击左上角 **🔑 按钮** 打开 API 密钥管理
2. 填写配置信息：
   - **配置名称**：任意名称，如 `OpenAI` / `DeepSeek`
   - **API 密钥**：你的 API Key（`sk-...`）
   - **Base URL**（可选）：默认为 `https://api.openai.com/v1`，可填写其他兼容端点
   - **模型**：模型名称，如 `gpt-4o` / `deepseek-chat`
3. 点击 **保存配置**
4. 在顶部下拉菜单选择刚添加的配置

### 3. 开始对话

在底部输入框输入消息，按 **Enter** 发送。

---

## 🔌 API 兼容性 | API Compatibility

本应用使用 OpenAI 兼容的 `/v1/chat/completions` 流式接口，支持以下平台：

| 平台 | Base URL 示例 |
|------|--------------|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Ollama (本地) | `http://localhost:11434/v1` |
| LiteLLM | `http://localhost:4000/v1` |
| 其他兼容代理 | 自定义 |

---

## 📂 项目结构 | Project Structure

```
ai(html)/
├── index.html          # 主页面，HTML 结构和弹窗
├── css/
│   └── style.css       # 完整样式表，含浅色/深色主题变量
├── js/
│   └── app.js          # 应用逻辑：流式请求、会话管理、渲染等
└── README.md           # 项目文档
```

---

## ⚠️ 注意事项 | Notes

- **API 密钥安全**：密钥存储在浏览器 localStorage 中，仅限本地使用。请勿在公共设备上保存敏感密钥。
- **浏览器支持**：需要支持 `ReadableStream` 和 `AbortController` 的现代浏览器（Chrome 85+、Edge 85+、Firefox 100+、Safari 14+）。
- **跨域问题**：如果使用本地 LLM 服务（如 Ollama），请确保服务端已配置 CORS 头。

---

## 📄 许可 | License

MIT License — 自由使用、修改和分发。

---

## 🌐 在线访问 | Live Demo

部署于 GitHub Pages：**[lkb-hub.github.io](https://lkb-hub.github.io/)**

---

> 💡 提示：首次使用请先配置 API 密钥，否则无法发送消息。
