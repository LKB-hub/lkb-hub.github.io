# 🤖 AI Chat Web

一个纯前端 AI 对话应用，支持 OpenAI 兼容 API 的流式对话、Markdown 渲染、代码高亮、多会话管理、深色/浅色主题切换。

A pure front-end AI chat application with streaming responses, Markdown rendering, code highlighting, multi-session management, and light/dark theme support.

---

## ✨ 功能特性 | Features

- 🔐 **用户登录** — Supabase Auth 邮箱注册/登录，国内可访问
- ☁️ **云端同步** — API 配置和聊天历史均存 Supabase 云端数据库，换设备自动同步
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
- 💾 **本地持久化** — 会话数据、设置、主题存 localStorage，离线可用
- 📱 **响应式设计** — 窄屏自动隐藏侧边栏

---

## 🛠 技术栈 | Tech Stack

| 层级 | 技术 |
|------|------|
| 结构 | HTML5 |
| 样式 | CSS3 (CSS Custom Properties 主题系统) |
| 逻辑 | Vanilla JavaScript (ES6+) |
| 认证 | [Supabase Auth](https://supabase.com/auth) |
| 数据库 | [Supabase (PostgreSQL)](https://supabase.com/database) |
| Markdown | [marked.js](https://github.com/markedjs/marked) |
| 代码高亮 | [highlight.js](https://highlightjs.org/) |

**零构建工具，零自有后端。Supabase 提供认证和数据库服务（国内可访问）。**

---

## 🔐 Supabase 配置（登录与云端同步）

本应用使用 [Supabase](https://supabase.com)（开源 BaaS，国内可访问）实现用户登录和 API 配置云端同步。**首次使用前需要完成以下配置：**

### 1. 创建 Supabase 项目

1. 前往 [Supabase](https://supabase.com) 注册账号
2. 点击 **New project** 创建项目
3. 填写项目名称，设置数据库密码，选择区域（建议选 **ap-southeast-1 新加坡** 延迟最低）
4. 等待项目初始化完成（约 2 分钟）

### 2. 获取 API 密钥

1. 在项目左侧菜单，进入 **Settings → API**
2. 复制 **Project URL**（例如 `https://xxxxx.supabase.co`）
3. 复制 **anon public key**（以 `eyJ` 开头的长字符串）

### 3. 创建数据库表

在左侧菜单进入 **SQL Editor**，点击 **New query**，粘贴以下 SQL 并运行：

```sql
-- 创建用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  api_configs JSONB DEFAULT '{}'::jsonb,
  current_api TEXT DEFAULT '',
  sessions JSONB DEFAULT '{}'::jsonb,
  current_session TEXT DEFAULT '默认会话',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全 (RLS)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的设置
CREATE POLICY "Users manage own settings"
ON user_settings FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 4. 关闭邮箱确认（可选，开发阶段）

在 **Authentication → Settings** 中，取消勾选 **Confirm email**（否则注册后需去邮箱点击确认链接）。生产环境建议开启。

### 5. 填入配置

打开 `js/supabase.js`，填入第 2 步获取的 URL 和 anon key：

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';     // 替换
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';  // 替换
```

### 6. 完成！

打开应用 → 注册账号 → 登录 → 配置的 API 密钥和聊天历史自动同步到云端 🌩️

---

## 🚀 快速开始 | Quick Start

### 1. 打开应用

建议用 HTTP 服务器打开以获得最佳体验：

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code Live Server 插件
```

然后访问 `http://localhost:8080`

### 2. 注册并登录

1. 首次打开应用会显示登录页面
2. 点击 **注册** 标签
3. 输入邮箱和密码（至少 6 位），点击注册
4. 注册成功后自动登录

### 3. 配置 API

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
│   └── style.css       # 完整样式表，含浅色/深色主题 + 登录页
├── js/
│   ├── supabase.js     # Supabase 初始化配置
│   └── app.js          # 应用逻辑：认证、流式请求、会话管理
└── README.md           # 项目文档
```

---

## ⚠️ 注意事项 | Notes

- **Supabase 配置**：首次使用前需按上方「🔐 Supabase 配置」章节完成设置，否则无法登录。
- **API 密钥安全**：登录后 API 密钥存储在 Supabase PostgreSQL 云端数据库中。请设置强密码保护你的账号。
- **浏览器支持**：需要支持 `ReadableStream` 和 `AbortController` 的现代浏览器（Chrome 85+、Edge 85+、Firefox 100+、Safari 14+）。
- **跨域问题**：如果使用本地 LLM 服务（如 Ollama），请确保服务端已配置 CORS 头。
- **Supabase 免费额度**：免费计划含 5 万月活用户、500MB 数据库、1GB 存储，个人使用绰绰有余。

---

## 📄 许可 | License

MIT License — 自由使用、修改和分发。

---

## 🌐 在线访问 | Live Demo

部署于 GitHub Pages：**[lkb-hub.github.io](https://lkb-hub.github.io/)**

---

> 💡 提示：首次使用请先配置 API 密钥，否则无法发送消息。
