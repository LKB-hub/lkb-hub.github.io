/**
 * AI Chat Web - 完整应用逻辑
 * 功能：流式对话、Markdown 渲染、多会话、主题切换、API 密钥管理
 */

// ============================================================================
// 配置 marked.js
// ============================================================================

marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; }
      catch (e) { /* fall through */ }
    }
    return hljs.highlightAuto(code).value;
  }
});

// ============================================================================
// 应用状态
// ============================================================================

const DEFAULT_SETTINGS = {
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 0.9,
  font_size: 14
};

const state = {
  sessions: {},           // { name: { messages: [], systemPrompt: '', createdAt } }
  currentSession: '默认会话',
  apiConfigs: {},         // { name: { api_key, base_url, model } }
  currentApi: '',
  settings: { ...DEFAULT_SETTINGS },
  theme: 'light',
  isStreaming: false,
  streamAborter: null,
  searchTerm: '',
  authState: {
    user: null,           // Supabase user object | null
    loading: true         // 初始化检查中
  }
};

// ============================================================================
// localStorage 持久化
// ============================================================================

function loadState() {
  try {
    const saved = localStorage.getItem('aichat_web_state');
    if (saved) {
      const data = JSON.parse(saved);
      state.sessions = data.sessions || {};
      state.currentSession = data.currentSession || '默认会话';
      state.apiConfigs = data.apiConfigs || {};
      state.currentApi = data.currentApi || '';
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      state.theme = data.theme || 'light';
    }
  } catch (e) { /* ignore */ }

  // 确保默认会话存在
  if (!state.sessions['默认会话']) {
    state.sessions['默认会话'] = { messages: [], systemPrompt: '', createdAt: Date.now() };
  }
  if (!state.currentSession || !state.sessions[state.currentSession]) {
    state.currentSession = Object.keys(state.sessions)[0] || '默认会话';
  }
}

// 仅加载本地数据（不含 API 配置 — 登录前使用，API 配置等登录后从云端拉取）
function loadLocalStateOnly() {
  try {
    const saved = localStorage.getItem('aichat_web_state');
    if (saved) {
      const data = JSON.parse(saved);
      state.sessions = data.sessions || {};
      state.currentSession = data.currentSession || '默认会话';
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      state.theme = data.theme || 'light';
    }
  } catch (e) { /* ignore */ }

  if (!state.sessions['默认会话']) {
    state.sessions['默认会话'] = { messages: [], systemPrompt: '', createdAt: Date.now() };
  }
  if (!state.currentSession || !state.sessions[state.currentSession]) {
    state.currentSession = Object.keys(state.sessions)[0] || '默认会话';
  }
}

function saveState() {
  try {
    localStorage.setItem('aichat_web_state', JSON.stringify({
      sessions: state.sessions,
      currentSession: state.currentSession,
      apiConfigs: state.apiConfigs,
      currentApi: state.currentApi,
      settings: state.settings,
      theme: state.theme
    }));
  } catch (e) { toast('存储空间不足，请清理旧会话', 'warning'); }
}

// ============================================================================
// Toast
// ============================================================================

function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
}

// ============================================================================
// 会话管理
// ============================================================================

function getCurrentMessages() {
  return state.sessions[state.currentSession].messages;
}

function createSession(name) {
  name = (name || '').trim();
  if (!name) {
    // 自动生成名称
    const existing = Object.keys(state.sessions).filter(k => k.startsWith('新会话'));
    name = `新会话${existing.length ? ' ' + (existing.length + 1) : ''}`;
  }
  if (state.sessions[name]) {
    toast('会话名称已存在', 'warning');
    return;
  }
  state.sessions[name] = { messages: [], systemPrompt: '', createdAt: Date.now() };
  state.currentSession = name;
  saveState();
  renderAll();
}

function deleteSession(name) {
  if (Object.keys(state.sessions).length <= 1) {
    toast('至少保留一个会话', 'warning');
    return;
  }
  const msgs = state.sessions[name].messages;
  if (msgs.length > 0 && !confirm(`确定删除会话「${name}」？\n包含 ${msgs.length} 条消息。`)) return;
  delete state.sessions[name];
  if (state.currentSession === name) {
    state.currentSession = Object.keys(state.sessions)[0];
  }
  saveState();
  renderAll();
}

// ============================================================================
// API 调用（流式）
// ============================================================================

function buildMessages() {
  const session = state.sessions[state.currentSession];
  const msgs = [];
  if (session.systemPrompt) {
    msgs.push({ role: 'system', content: session.systemPrompt });
  }
  // 只发送最近的消息（最多 MAX_HISTORY_ROUNDS 轮）
  const history = session.messages;
  const MAX_ROUNDS = 20;
  const recent = history.slice(-MAX_ROUNDS * 2);
  msgs.push(...recent);
  return msgs;
}

async function sendMessage(userText) {
  if (state.isStreaming) return;

  const cfg = state.apiConfigs[state.currentApi];
  if (!cfg) {
    toast('请先在 API 设置中配置密钥', 'error');
    return;
  }

  // 添加用户消息
  const session = state.sessions[state.currentSession];
  session.messages.push({ role: 'user', content: userText });
  saveState();

  state.isStreaming = true;
  renderAll();
  scrollToBottom();
  showTypingIndicator();

  const baseUrl = cfg.base_url || 'https://api.openai.com/v1';
  const apiUrl = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const body = {
    model: cfg.model || 'gpt-4o',
    messages: buildMessagesWithAgent(userText),
    max_tokens: state.settings.max_tokens,
    temperature: state.settings.temperature,
    top_p: state.settings.top_p,
    stream: true
  };

  const controller = new AbortController();
  state.streamAborter = controller;

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.api_key}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      let errMsg = `HTTP ${resp.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch (e) { errMsg += `: ${errText.slice(0, 200)}`; }
      throw new Error(errMsg);
    }

    // 读取流式响应
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    // 移除打字指示器，准备显示流式内容
    removeTypingIndicator();
    const aiBlock = createStreamingBlock();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            // 更新流式块内容
            updateStreamingBlock(aiBlock, fullContent);
          }
        } catch (e) { /* skip malformed chunks */ }
      }
    }

    // 最终渲染
    finalizeStreamingBlock(aiBlock, fullContent);
    session.messages.push({ role: 'assistant', content: fullContent });
    saveState();
    syncApiConfigsToCloud(); // 云端同步聊天记录

  } catch (err) {
    if (err.name === 'AbortError') {
      removeTypingIndicator();
    } else {
      removeTypingIndicator();
      addErrorBlock(err.message || '请求失败');
    }
  } finally {
    state.isStreaming = false;
    state.streamAborter = null;
    renderAll();
    scrollToBottom();
  }
}

function stopStreaming() {
  if (state.streamAborter) {
    state.streamAborter.abort();
    state.streamAborter = null;
    state.isStreaming = false;
    renderAll();
  }
}

// ============================================================================
// UI 渲染
// ============================================================================

function renderAll() {
  renderSessionList();
  renderModelLabel();
  renderModelSelect();
  renderChatMessages();
  updateSendButton();
}

function renderSessionList() {
  const list = document.getElementById('session-list');
  const names = Object.keys(state.sessions).sort((a, b) =>
    state.sessions[b].createdAt - state.sessions[a].createdAt
  );

  list.innerHTML = names.map(name => {
    const count = state.sessions[name].messages.length;
    const active = name === state.currentSession ? ' class="active"' : '';
    return `<li${active} data-session="${escapeHtml(name)}" onclick="switchSession('${escapeJs(name)}')">
      ${escapeHtml(name)} <span style="color:var(--fg-muted);font-size:11px">(${count})</span>
      <span class="del-session" onclick="event.stopPropagation();renameSession('${escapeJs(name)}')" style="cursor:pointer;margin-right:4px;font-size:12px;" title="重命名">✎</span>
      <span class="del-session" onclick="event.stopPropagation();deleteSession('${escapeJs(name)}')">✕</span>
    </li>`;
  }).join('');
}

function renderModelLabel() {
  const cfg = state.apiConfigs[state.currentApi];
  const model = cfg?.model || '未选择模型';
  document.getElementById('model-label').textContent = `🤖 ${model}`;
}

function renderModelSelect() {
  const select = document.getElementById('model-select');
  const names = Object.keys(state.apiConfigs);
  select.innerHTML = '<option value="">-- 选择API --</option>' +
    names.map(n => `<option value="${escapeHtml(n)}" ${n === state.currentApi ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  const msgs = getCurrentMessages();
  const fontSize = state.settings.font_size;

  let html = '';
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (msg.role === 'user') {
      html += `<div class="msg-block">
        <div class="msg-role user">你</div>
        <div class="msg-content" style="font-size:${fontSize}px">${escapeHtml(msg.content)}</div>
      </div>`;
    } else {
      html += `<div class="msg-block">
        <div class="msg-role ai">AI</div>
        <div class="msg-content" style="font-size:${fontSize}px">${renderMarkdown(msg.content)}</div>
        <div style="display:flex;gap:4px;margin-top:4px;padding-left:4px;">
          <button onclick="speakAIMessage(\`${escapeJs(msg.content).slice(0, 100)}...\`)" style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer;font-size:12px;" title="朗读">🔊</button>
          <button onclick="exportSingleMessage(${i})" style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer;font-size:12px;" title="导出本条消息">📤</button>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;

  // 高亮代码块
  container.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
  });
}

function createStreamingBlock() {
  const container = document.getElementById('chat-messages');
  const block = document.createElement('div');
  block.className = 'msg-block';
  block.innerHTML = `
    <div class="msg-role ai">AI</div>
    <div class="msg-content" id="streaming-content" style="font-size:${state.settings.font_size}px"></div>
  `;
  container.appendChild(block);
  return block;
}

function updateStreamingBlock(block, content) {
  const contentEl = block.querySelector('.msg-content');
  if (contentEl) {
    contentEl.innerHTML = renderMarkdown(content);
  }
  scrollToBottom();
}

function finalizeStreamingBlock(block, content) {
  const contentEl = block.querySelector('.msg-content');
  if (contentEl) {
    contentEl.innerHTML = renderMarkdown(content);
    // 高亮新代码块
    contentEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
  }
}

function showTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'msg-block';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="msg-role ai">AI</div>
    <div class="msg-content" style="padding:8px 0">
      <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function addErrorBlock(errMsg) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'msg-block';
  el.innerHTML = `
    <div class="msg-role ai">AI</div>
    <div class="msg-content msg-error">[请求失败: ${escapeHtml(errMsg)}]</div>
  `;
  container.appendChild(el);
}

function updateSendButton() {
  const btn = document.getElementById('btn-send');
  if (state.isStreaming) {
    btn.textContent = '停止 ⏹';
  } else {
    btn.textContent = '发送 ▶';
  }
  // 不再动态覆盖 onclick，点击行为由 addEventListener 统一处理
}

// ============================================================================
// Markdown 渲染
// ============================================================================

function renderMarkdown(text) {
  if (!text) return '';
  try {
    let html = marked.parse(text);

    // 包装代码块以便添加复制按钮
    html = html.replace(/<pre><code( class="language-(\w+)")?>/g, (match, cls, lang) => {
      const langName = lang || 'code';
      return `<div class="code-block">
        <div class="code-header">
          <span>${langName}</span>
          <button class="copy-btn" onclick="copyCode(this)">📋 复制</button>
        </div>
        <pre><code${cls || ''}>`;
    });
    html = html.replace(/<\/code><\/pre>/g, '</code></pre></div>');

    // 使链接在新标签页打开
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener" ');

    return html;
  } catch (e) {
    return escapeHtml(text);
  }
}

function copyCode(btn) {
  const codeBlock = btn.closest('.code-block');
  const code = codeBlock?.querySelector('code')?.textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '✅ 已复制';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 复制'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => toast('复制失败', 'error'));
}

// ============================================================================
// 操作
// ============================================================================

function handleSend() {
  // 防止移动端多次点击触发多次发送
  if (state.isStreaming) {
    stopStreaming();
    return;
  }

  const input = document.getElementById('msg-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return; // 空内容直接返回，不弹 toast（避免 blur 和 click 竞争时误报）

  input.value = '';
  sendMessage(text);
}

function switchSession(name) {
  state.currentSession = name;
  saveState();
  renderAll();
  scrollToBottom();
  // 手机端关闭侧边栏
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-mask').classList.remove('show');
}

function clearCurrentSession() {
  if (!confirm('确定清空当前会话的所有消息？')) return;
  state.sessions[state.currentSession].messages = [];
  saveState();
  renderAll();
}

function exportChat() {
  const session = state.sessions[state.currentSession];
  const msgs = session.messages;
  if (!msgs.length) { toast('当前会话无消息', 'warning'); return; }

  let markdown = `# ${state.currentSession}\n\n`;
  markdown += `> 导出时间: ${new Date().toLocaleString()}\n\n---\n\n`;
  for (const m of msgs) {
    const role = m.role === 'user' ? '👤 你' : '🤖 AI';
    markdown += `### ${role}\n\n${m.content}\n\n---\n\n`;
  }

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.currentSession}_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

function searchMessages() {
  const term = document.getElementById('search-input').value.trim().toLowerCase();
  const results = document.getElementById('search-results');
  if (!term) { results.innerHTML = ''; return; }

  const msgs = getCurrentMessages();
  const found = [];
  msgs.forEach((m, i) => {
    if (m.content.toLowerCase().includes(term)) {
      found.push({ index: i, role: m.role, text: m.content.slice(0, 200) });
    }
  });

  results.innerHTML = found.map(f => {
    const highlighted = f.text.replace(new RegExp(`(${escapeRegex(term)})`, 'gi'),
      '<span class="highlight">$1</span>');
    return `<div class="search-item" onclick="scrollToMessage(${f.index})">
      <strong>${f.role === 'user' ? '👤 你' : '🤖 AI'}</strong>
      <div>${highlighted}...</div>
    </div>`;
  }).join('') || '<div style="color:var(--fg-muted)">未找到匹配消息</div>';
}

function scrollToMessage(index) {
  closeModal('modal-search');
  const blocks = document.querySelectorAll('.msg-block');
  if (blocks[index]) {
    blocks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    blocks[index].style.background = 'var(--bg-selected)';
    setTimeout(() => { blocks[index].style.background = ''; }, 2000);
  }
}

// ============================================================================
// 弹窗
// ============================================================================

function openModal(id) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
  if (id === 'modal-api') {
    cancelEdit(); // 打开弹窗时重置编辑状态
    renderApiList();
  }
  if (id === 'modal-prompt') {
    document.getElementById('system-prompt').value =
      state.sessions[state.currentSession].systemPrompt || '';
  }
  if (id === 'modal-settings') {
    document.getElementById('set-temperature').value = state.settings.temperature;
    document.getElementById('temp-val').textContent = state.settings.temperature;
    document.getElementById('set-max-tokens').value = state.settings.max_tokens;
    document.getElementById('set-top-p').value = state.settings.top_p;
    document.getElementById('topp-val').textContent = state.settings.top_p;
    document.getElementById('set-font-size').value = state.settings.font_size;
    document.getElementById('font-val').textContent = state.settings.font_size + 'px';
    document.getElementById('set-proxy-enabled').checked = !!state.settings.proxy_enabled;
    document.getElementById('set-proxy-url').value = state.settings.proxy_url || '';
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  // 检查是否还有其他弹窗打开
  const anyOpen = document.querySelectorAll('.modal:not(.hidden)').length > 0;
  if (!anyOpen) document.getElementById('overlay').classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('overlay').classList.add('hidden');
}

function renderApiList() {
  const container = document.getElementById('api-list');
  const names = Object.keys(state.apiConfigs);
  container.innerHTML = names.map(n => {
    const cfg = state.apiConfigs[n];
    const active = n === state.currentApi ? ' ✅ 当前' : '';
    return `<div class="api-item">
      <span>${escapeHtml(n)} (${escapeHtml(cfg.model || '?')})${active}</span>
      <div>
        <button class="api-use" onclick="editApi('${escapeJs(n)}')" style="background:var(--accent-primary);">编辑</button>
        <button class="api-del" onclick="deleteApi('${escapeJs(n)}')">删除</button>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--fg-muted)">暂无配置</div>';
}

let editingApiName = null; // 当前正在编辑的 API 名称，null 表示新增模式

function editApi(name) {
  const cfg = state.apiConfigs[name];
  if (!cfg) return;
  document.getElementById('api-name').value = name;
  document.getElementById('api-key').value = cfg.api_key;
  document.getElementById('api-url').value = cfg.base_url || '';
  document.getElementById('api-model').value = cfg.model || '';
  editingApiName = name;
  document.getElementById('btn-save-api').textContent = '保存修改';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');
  toast('正在编辑: ' + name, 'info');
}

function cancelEdit() {
  editingApiName = null;
  document.getElementById('api-name').value = '';
  document.getElementById('api-key').value = '';
  document.getElementById('api-url').value = '';
  document.getElementById('api-model').value = '';
  document.getElementById('btn-save-api').textContent = '保存配置';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
}

function saveApiConfig() {
  const name = document.getElementById('api-name').value.trim();
  const key = document.getElementById('api-key').value.trim();
  const url = document.getElementById('api-url').value.trim();
  const model = document.getElementById('api-model').value.trim();

  if (!name) { toast('请输入配置名称', 'warning'); return; }
  if (!key) { toast('请输入 API 密钥', 'warning'); return; }
  if (!model) { toast('请输入模型名称', 'warning'); return; }

  // 编辑模式：同名覆盖
  if (editingApiName && editingApiName !== name) {
    delete state.apiConfigs[editingApiName];
    if (state.currentApi === editingApiName) {
      state.currentApi = name;
    }
  }

  state.apiConfigs[name] = {
    api_key: key,
    base_url: url || 'https://api.openai.com/v1',
    model: model
  };
  if (!state.currentApi) state.currentApi = name;
  saveState();
  syncApiConfigsToCloud();
  renderApiList();
  renderModelSelect();
  renderModelLabel();

  // 重置表单
  cancelEdit();
  toast(editingApiName || name ? 'API 配置已保存' : 'API 配置已保存', 'success');
}

function useApi(name) {
  state.currentApi = name;
  saveState();
  syncApiConfigsToCloud();
  renderApiList();
  renderModelSelect();
  renderModelLabel();
  toast(`已切换到 ${name}`, 'info');
}

function deleteApi(name) {
  if (!confirm(`确定删除配置「${name}」？`)) return;
  delete state.apiConfigs[name];
  if (state.currentApi === name) {
    state.currentApi = Object.keys(state.apiConfigs)[0] || '';
  }
  saveState();
  syncApiConfigsToCloud();
  renderApiList();
  renderModelSelect();
  renderModelLabel();
}

function savePrompt() {
  const text = document.getElementById('system-prompt').value;
  state.sessions[state.currentSession].systemPrompt = text;
  saveState();
  closeModal('modal-prompt');
  toast('系统提示词已保存', 'success');
}

function saveSettings() {
  state.settings.temperature = parseFloat(document.getElementById('set-temperature').value);
  state.settings.max_tokens = parseInt(document.getElementById('set-max-tokens').value);
  state.settings.top_p = parseFloat(document.getElementById('set-top-p').value);
  state.settings.font_size = parseInt(document.getElementById('set-font-size').value);
  saveState();
  closeModal('modal-settings');
  renderAll();
  toast('设置已保存', 'success');
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('hljs-light').disabled = state.theme === 'dark';
  document.getElementById('hljs-dark').disabled = state.theme === 'light';
  saveState();
}

// ============================================================================
// 工具函数
// ============================================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    document.getElementById('scroll-anchor')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ============================================================================
// Supabase Auth 登录/注册/登出
// ============================================================================

function showAuthUI() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('auth-error').textContent = '';
}

function hideAuthUI() {
  document.getElementById('auth-container').classList.add('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
}

function setAuthLoading(loading) {
  const forms = document.querySelectorAll('#login-form, #register-form');
  const loadingEl = document.getElementById('auth-loading');
  forms.forEach(f => {
    const btn = f.querySelector('.auth-submit-btn');
    if (btn) btn.disabled = loading;
  });
  if (loading) {
    loadingEl.classList.remove('hidden');
  } else {
    loadingEl.classList.add('hidden');
  }
}

function handleLogin(email, password) {
  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }

  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    console.error('[Auth] supabaseClient 未定义，无法登录');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.signInWithPassword({ email, password })
    .then(({ data, error }) => {
      if (error) {
        let msg = '登录失败';
        if (error.message.includes('Invalid login credentials')) msg = '邮箱或密码错误';
        else if (error.message.includes('Email not confirmed')) msg = '请先确认邮箱';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
        console.error('[Auth] 登录错误:', error.message);
      } else {
        console.log('[Auth] 登录成功:', data?.user?.email);
      }
      // 成功时 onAuthStateChange 会自动触发
    })
    .catch(err => {
      console.error('[Auth] 登录异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function handleRegister(email, password, confirmPassword) {
  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }
  if (password.length < 6) {
    showAuthError('密码至少需要6位');
    return;
  }
  if (password !== confirmPassword) {
    showAuthError('两次输入的密码不一致');
    return;
  }

  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    console.error('[Auth] supabaseClient 未定义，无法注册');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.signUp({ email, password })
    .then(({ data, error }) => {
      if (error) {
        let msg = '注册失败';
        if (error.message.includes('already registered')) msg = '该邮箱已被注册，请直接登录';
        else if (error.message.includes('rate limit')) msg = '操作太频繁，请稍等几分钟再试';
        else if (error.message.includes('Password')) msg = '密码强度不足，请使用更复杂的密码';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
        console.error('[Auth] 注册错误:', error.message);
      } else {
        console.log('[Auth] 注册成功:', data?.user?.email);
        toast('注册成功！请检查邮箱确认（如已关闭邮箱确认则直接登录）', 'success');
      }
    })
    .catch(err => {
      console.error('[Auth] 注册异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function skipAuth() {
  console.log('[Auth] 用户选择跳过登录，进入离线模式');
  state.authState.loading = false;
  state.authState.user = null;
  hideAuthUI();
  updateUserUI();
  loadState();
  renderAll();
  toast('已进入离线模式，数据保存在本地浏览器', 'info');
}

function handleResetPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    showAuthError('请先输入邮箱地址');
    return;
  }
  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.resetPasswordForEmail(email)
    .then(({ error }) => {
      if (error) {
        let msg = '发送失败';
        if (error.message.includes('rate limit')) msg = '操作太频繁，请稍等几分钟再试';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
      } else {
        toast('重置密码邮件已发送，请检查邮箱', 'success');
      }
    })
    .catch(err => {
      console.error('[Auth] 重置密码异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function handleLogout() {
  if (!confirm('确定退出登录？\n退出后需要重新登录才能使用。')) return;
  if (!supabaseClient) {
    toast('认证服务不可用', 'error');
    return;
  }
  supabaseClient.auth.signOut()
    .then(() => console.log('[Auth] 已退出登录'))
    .catch(err => toast('退出失败: ' + err.message, 'error'));
}

// ============================================================================
// Supabase 云端同步
// ============================================================================

async function syncApiConfigsFromCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', state.authState.user.id)
      .maybeSingle();

    if (error) throw error;

    // 同步 API 配置
    if (data && data.api_configs && Object.keys(data.api_configs).length > 0) {
      state.apiConfigs = data.api_configs;
    }
    if (data && data.current_api && state.apiConfigs[data.current_api]) {
      state.currentApi = data.current_api;
    } else if (data && Object.keys(state.apiConfigs).length > 0) {
      state.currentApi = Object.keys(state.apiConfigs)[0] || '';
    }

    // 同步聊天会话历史
    if (data && data.sessions && typeof data.sessions === 'object' && Object.keys(data.sessions).length > 0) {
      state.sessions = data.sessions;
      // 确保当前会话存在
      if (!state.currentSession || !state.sessions[state.currentSession]) {
        state.currentSession = Object.keys(state.sessions)[0];
      }
    }
  } catch (err) {
    console.error('从云端加载数据失败:', err);
    toast('云端同步失败，使用本地缓存', 'warning');
  }
}

async function syncApiConfigsToCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from('user_settings')
      .upsert({
        user_id: state.authState.user.id,
        api_configs: state.apiConfigs,
        current_api: state.currentApi,
        sessions: state.sessions,
        current_session: state.currentSession,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (err) {
    console.error('同步数据到云端失败:', err);
  }
}

async function migrateLocalToCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    // 从 localStorage 读取旧数据
    const saved = localStorage.getItem('aichat_web_state');
    if (!saved) return;
    const localData = JSON.parse(saved);
    const localConfigs = localData.apiConfigs || {};
    const localSessions = localData.sessions || {};

    // 检查云端是否已有数据
    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', state.authState.user.id)
      .maybeSingle();

    if (error) throw error;

    const cloudHasConfigs = data && data.api_configs && Object.keys(data.api_configs).length > 0;
    const cloudHasSessions = data && data.sessions && Object.keys(data.sessions).length > 0;
    const localHasConfigs = Object.keys(localConfigs).length > 0;
    const localHasSessions = Object.keys(localSessions).length > 0;

    if (cloudHasConfigs || cloudHasSessions) {
      // 云端已有数据，合并（云端优先，本地补充）
      if (localHasConfigs) {
        const merged = { ...localConfigs, ...(data.api_configs || {}) };
        state.apiConfigs = merged;
        state.currentApi = data.current_api || Object.keys(merged)[0] || '';
      }
      if (localHasSessions) {
        // 会话合并：以云端为主，本地新增的会话也加入
        const mergedSessions = { ...(data.sessions || {}), ...localSessions };
        state.sessions = mergedSessions;
        state.currentSession = data.current_session || state.currentSession || Object.keys(mergedSessions)[0];
      }
      await syncApiConfigsToCloud();
      toast('已合并本地和云端的会话数据', 'info');
    } else if (localHasConfigs || localHasSessions) {
      // 云端无数据，上传本地全部数据
      state.apiConfigs = localConfigs;
      state.currentApi = localData.currentApi || Object.keys(localConfigs)[0] || '';
      state.sessions = localSessions;
      state.currentSession = localData.currentSession || Object.keys(localSessions)[0] || '默认会话';
      await syncApiConfigsToCloud();
      toast('已将本地数据迁移到云端', 'success');
    }
  } catch (err) {
    console.error('迁移本地数据失败:', err);
  }
}

// ============================================================================
// 初始化
// ============================================================================

function updateUserUI() {
  const userEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('btn-logout');
  if (!userEl || !logoutBtn) {
    console.error('[UI] user-email 或 btn-logout 元素未找到');
    return;
  }
  if (state.authState.user) {
    const email = state.authState.user.email;
    console.log('[UI] 更新用户显示:', email);
    userEl.textContent = email;
    userEl.title = email;
    userEl.style.removeProperty('display');
    logoutBtn.style.removeProperty('display');
  } else {
    console.log('[UI] 清除用户显示');
    userEl.textContent = '';
    userEl.title = '当前登录用户';
    userEl.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

function bindAppEvents() {
  // 发送按钮：用 addEventListener 确保移动端点击可靠触发
  // updateSendButton 不再覆盖 onclick，改为只改文字
  const sendBtn = document.getElementById('btn-send');
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.isStreaming) {
      stopStreaming();
    } else {
      handleSend();
    }
  });

  // Enter 发送
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 新建会话
  document.getElementById('btn-new-session').addEventListener('click', () => {
    const name = prompt('输入会话名称（留空自动生成）:');
    createSession(name);
  });

  // 删除会话
  document.getElementById('btn-delete-session').addEventListener('click', () => {
    deleteSession(state.currentSession);
  });

  // 清空对话
  document.getElementById('btn-clear').addEventListener('click', clearCurrentSession);

  // 导出
  document.getElementById('btn-export').addEventListener('click', exportChat);

  // 主题切换
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // 退出登录
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // API 弹窗
  document.getElementById('btn-api').addEventListener('click', () => openModal('modal-api'));
  document.getElementById('btn-save-api').addEventListener('click', saveApiConfig);
  document.getElementById('btn-cancel-edit').addEventListener('click', cancelEdit);

  // 提示词弹窗
  document.getElementById('btn-prompt').addEventListener('click', () => openModal('modal-prompt'));
  document.getElementById('btn-save-prompt').addEventListener('click', savePrompt);

  // 设置弹窗
  document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));

  // 搜索弹窗
  document.getElementById('btn-search').addEventListener('click', () => openModal('modal-search'));
  document.getElementById('search-input').addEventListener('input', searchMessages);

  // 模型切换
  document.getElementById('model-select').addEventListener('change', e => {
    state.currentApi = e.target.value;
    saveState();
    syncApiConfigsToCloud();
    renderModelLabel();
  });

  // 弹窗关闭按钮
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });

  // 点击遮罩关闭
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAllModals();
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // 设置面板实时更新
  document.getElementById('set-temperature').addEventListener('input', e => {
    document.getElementById('temp-val').textContent = e.target.value;
  });
  document.getElementById('set-top-p').addEventListener('input', e => {
    document.getElementById('topp-val').textContent = e.target.value;
  });
  document.getElementById('set-font-size').addEventListener('input', e => {
    document.getElementById('font-val').textContent = e.target.value + 'px';
  });
  document.getElementById('set-max-tokens').addEventListener('change', saveSettings);
  document.getElementById('set-temperature').addEventListener('change', saveSettings);
  document.getElementById('set-top-p').addEventListener('change', saveSettings);
  document.getElementById('set-font-size').addEventListener('change', saveSettings);

  // 登录 tab 切换
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
      document.getElementById('auth-error').textContent = '';
    });
  });

  // 登录表单提交
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    console.log('[Auth] 登录表单提交');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    handleLogin(email, password);
  });

  // 注册表单提交
  document.getElementById('register-form').addEventListener('submit', e => {
    e.preventDefault();
    console.log('[Auth] 注册表单提交');
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPwd = document.getElementById('reg-password-confirm').value;
    handleRegister(email, password, confirmPwd);
  });

  // 手机端汉堡菜单
  const sidebar = document.getElementById('sidebar');
  const mask = document.getElementById('sidebar-mask');
  document.getElementById('btn-menu').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    mask.classList.toggle('show');
  });
  mask.addEventListener('click', () => {
    sidebar.classList.remove('open');
    mask.classList.remove('show');
  });

  // 跳过登录
  document.getElementById('btn-skip-auth').addEventListener('click', skipAuth);

  // 忘记密码
  document.getElementById('forgot-password').addEventListener('click', e => {
    e.preventDefault();
    handleResetPassword();
  });

  scrollToBottom();
}

function init() {
  console.log('[App] 初始化开始...');
  console.log('[App] supabaseClient:', supabaseClient ? '已就绪' : '未加载!');

  // 先加载本地数据（会话、主题、设置，不含 API 配置）
  loadLocalStateOnly();

  // 应用主题
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('hljs-light').disabled = state.theme === 'dark';
  document.getElementById('hljs-dark').disabled = state.theme === 'light';

  // 绑定应用事件（一次性绑定）
  bindAppEvents();

  // 若 Supabase SDK 未加载，直接展示登录界面（离线模式）
  if (!supabaseClient) {
    console.warn('[App] Supabase 未加载，进入离线模式');
    state.authState.loading = false;
    showAuthUI();
    updateUserUI();
    loadState();
    renderAll();
    return;
  }

  // 先展示 auth UI（避免在 onAuthStateChange 触发前的空白期）
  // onAuthStateChange 会在确认登录状态后决定是否隐藏
  showAuthUI();

  // 监听 Supabase Auth 状态
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] 状态变化:', event, session?.user?.email || '(未登录)');

    const user = session?.user ?? null;
    state.authState.user = user;
    state.authState.loading = false;

    if (user) {
      // 用户已登录
      hideAuthUI();
      updateUserUI();

      // 从云端拉取所有数据（API 配置 + 聊天会话）
      await syncApiConfigsFromCloud();

      // 合并/迁移本地旧数据到云端（如需要）
      await migrateLocalToCloud();

      // 渲染 UI
      renderAll();
    } else {
      // 用户未登录
      showAuthUI();
      updateUserUI();

      // 从 localStorage 加载 API 配置（离线模式）
      loadState();

      // 渲染 UI（显示在登录页后面，登录后立即可用）
      renderAll();
    }
  });
}

// ============================================================================
// Agent 路由 (agents.py)
// ============================================================================

const AGENTS = [
  {
    name: '代码专家',
    keywords: ['代码','编程','python','javascript','java','html','css','debug','bug','错误','函数','算法','程序','开发','写代码','implementation','implement'],
    systemPrompt: '你是一名资深程序员，擅长编写、调试和优化代码。请提供清晰、可运行、有注释的代码示例。'
  },
  {
    name: '翻译专家',
    keywords: ['翻译','translate','译成','翻成','英文怎么说','中文怎么说','英文翻译','中文翻译','翻译成','interpretation'],
    systemPrompt: '你是一名专业翻译，擅长多语种互译。请准确翻译，保持原文风格和语境。'
  },
  {
    name: '写作专家',
    keywords: ['写作','文章','作文','文案','润色','修改','创作','写一','撰写','起草','essay','article','write'],
    systemPrompt: '你是一名专业写作者，擅长各类文体创作和润色改进。'
  },
  {
    name: '分析专家',
    keywords: ['分析','数据','报告','统计','趋势','图表','调研','分析一下','对比','总结','归纳','analytics'],
    systemPrompt: '你是一名数据分析师和战略顾问，擅长数据分析和逻辑推理。'
  },
  {
    name: '创意专家',
    keywords: ['创意','设计','策划','brainstorm','脑暴','灵感','idea','创意方案','设计方案','构思'],
    systemPrompt: '你是一名创意设计师和头脑风暴专家，擅长创意策划和 brainstorming。'
  },
  {
    name: '通用助手',
    keywords: ['帮助','问题','请问','?','什么','如何','怎么','what','how','why','when','where','help'],
    systemPrompt: '你是一个有帮助的 AI 助手。'
  }
];

function detectAgent(query) {
  let bestAgent = AGENTS[AGENTS.length - 1]; // default: General
  let bestScore = 0;
  const q = query.toLowerCase();
  for (const agent of AGENTS) {
    const matches = agent.keywords.filter(kw => q.includes(kw.toLowerCase())).length;
    const score = Math.min(1.0, matches / Math.max(agent.keywords.length, 1) * 2);
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }
  return bestScore > 0.3 && bestAgent.name !== '通用助手' ? bestAgent : null;
}

function buildMessages() {
  const session = state.sessions[state.currentSession];
  const msgs = [];
  if (session.systemPrompt) {
    msgs.push({ role: 'system', content: session.systemPrompt });
  }
  const history = session.messages;
  const MAX_ROUNDS = 20;
  const recent = history.slice(-MAX_ROUNDS * 2);
  msgs.push(...recent);
  return msgs;
}

// Override buildMessages to inject agent system prompt
const originalBuildMessages = buildMessages;
function buildMessagesWithAgent(userText) {
  const session = state.sessions[state.currentSession];
  const msgs = [];
  if (session.systemPrompt) {
    msgs.push({ role: 'system', content: session.systemPrompt });
  }
  // Check agent routing
  const agent = detectAgent(userText);
  if (agent) {
    msgs.unshift({ role: 'system', content: agent.systemPrompt });
    renderModelLabel(agent.name);
  }
  const history = session.messages;
  const MAX_ROUNDS = 20;
  const recent = history.slice(-MAX_ROUNDS * 2);
  msgs.push(...recent);
  return msgs;
}

function renderModelLabel(agentName) {
  const cfg = state.apiConfigs[state.currentApi];
  const model = cfg?.model || '未选择模型';
  const label = agentName ? `${agentName} | ${model}` : `🤖 ${model}`;
  document.getElementById('model-label').textContent = label;
}

// ============================================================================
// 会话重命名 (rename_dialog.py)
// ============================================================================

let renameOldName = null;

function renameSession(oldName) {
  renameOldName = oldName;
  const modal = document.getElementById('modal-rename');
  const oldNameSpan = document.getElementById('rename-old-name');
  const input = document.getElementById('rename-input');
  oldNameSpan.textContent = oldName;
  input.value = oldName;
  openModal('modal-rename');
  setTimeout(() => { input.focus(); input.select(); }, 100);
}

function doRename() {
  if (!renameOldName) return;
  const newName = document.getElementById('rename-input').value.trim();
  if (!newName) { toast('请输入新名称', 'warning'); return; }
  if (newName === renameOldName) { closeModal('modal-rename'); return; }
  if (state.sessions[newName]) { toast('会话名称已存在', 'warning'); return; }

  // Rename in sessions dict
  state.sessions[newName] = state.sessions[renameOldName];
  delete state.sessions[renameOldName];

  // Update current session if needed
  if (state.currentSession === renameOldName) {
    state.currentSession = newName;
  }

  saveState();
  closeModal('modal-rename');
  renderAll();
  toast(`已重命名为: ${newName}`, 'success');
  renameOldName = null;
}

// ============================================================================
// API 使用按钮 (api_manager.py)
// ============================================================================

function renderApiList() {
  const container = document.getElementById('api-list');
  const names = Object.keys(state.apiConfigs);
  container.innerHTML = names.map(n => {
    const cfg = state.apiConfigs[n];
    const active = n === state.currentApi ? ' ✅ 当前' : '';
    return `<div class="api-item">
      <span>${escapeHtml(n)} (${escapeHtml(cfg.model || '?')})${active}</span>
      <div>
        <button class="api-use" onclick="useApi('${escapeJs(n)}')">使用</button>
        <button class="api-use" onclick="editApi('${escapeJs(n)}')" style="background:var(--accent-primary);">编辑</button>
        <button class="api-del" onclick="deleteApi('${escapeJs(n)}')">删除</button>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--fg-muted)">暂无配置</div>';
}

// ============================================================================
// 余额查询 (balance_dialog.py)
// ============================================================================

async function checkBalance() {
  const cfg = state.apiConfigs[state.currentApi];
  if (!cfg) { toast('请先配置 API', 'error'); return; }
  if (!cfg.api_key) { toast('缺少 API 密钥', 'error'); return; }

  const body = document.getElementById('balance-body');
  body.innerHTML = '<div style="color:var(--fg-muted);text-align:center;padding:20px;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
  openModal('modal-balance');

  const base = (cfg.base_url || '').toLowerCase();
  const provider = state.currentApi || '';

  let url = null;
  let parseFn = null;

  if (provider.includes('SiliconFlow') || base.includes('siliconflow')) {
    url = 'https://api.siliconflow.com/v1/user/info';
    parseFn = (data) => {
      const d = data.data || {};
      return [
        ['总余额', d.totalBalance || '-'],
        ['充值余额', d.chargeBalance || '-'],
        ['赠送余额', d.balance || '-'],
        ['账户状态', d.status || '-']
      ];
    };
  } else if (provider.includes('DeepSeek') || base.includes('deepseek')) {
    url = 'https://api.deepseek.com/user/balance';
    parseFn = (data) => {
      const infos = data.balance_infos || [];
      const results = [];
      for (const info of infos) {
        results.push(['币种', info.currency || '-']);
        results.push(['总余额', info.total_balance || '-']);
        results.push(['赠送余额', info.granted_balance || '-']);
        results.push(['充值余额', info.topped_up_balance || '-']);
      }
      return results;
    };
  } else {
    body.innerHTML = `<div style="color:var(--fg-muted);text-align:center;padding:20px;">
      <p>当前配置 "${escapeHtml(provider)}" 暂不支持余额查询</p>
      <p style="margin-top:8px;font-size:var(--font-sm);">SiliconFlow 和 DeepSeek 支持余额查询</p>
    </div>`;
    return;
  }

  try {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${cfg.api_key}` }
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    const details = parseFn(data);

    let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    for (const [label, value] of details) {
      const isBalance = label.includes('余额');
      html += `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-hover);border-radius:6px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">${label}</span>
        <span style="font-weight:700;font-size:${isBalance ? '18px' : 'var(--font-sm)'};color:${isBalance ? 'var(--accent-secondary)' : 'var(--fg-text)'};">${escapeHtml(value)}</span>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--fg-error);text-align:center;padding:20px;">
      <p>查询失败: ${escapeHtml(err.message)}</p>
    </div>`;
  }
}

// ============================================================================
// 翻译服务 (translation.py)
// ============================================================================

const LANGUAGES = {
  '中文': 'Chinese', 'English': 'English', '日本語': 'Japanese',
  '한국어': 'Korean', 'Français': 'French', 'Deutsch': 'German',
  'Español': 'Spanish', 'Português': 'Portuguese', 'Русский': 'Russian',
  'العربية': 'Arabic', 'Italiano': 'Italian', 'Nederlands': 'Dutch',
  'Polski': 'Polish', 'Türkçe': 'Turkish', 'Tiếng Việt': 'Vietnamese',
  'ไทย': 'Thai', 'हिन्दी': 'Hindi', 'Bahasa Melayu': 'Malay'
};

async function doTranslate(source, target, text) {
  const cfg = state.apiConfigs[state.currentApi];
  if (!cfg) { toast('请先配置 API', 'error'); return; }

  const srcName = LANGUAGES[source] || source;
  const tgtName = LANGUAGES[target] || target;
  const prompt = source === 'auto'
    ? `请识别以下文本的语言，并将其翻译为${tgtName}。只返回翻译结果，不要解释。\n\n${text}`
    : `请将以下${srcName}文本翻译为${tgtName}，只返回翻译结果：\n\n${text}`;

  const baseUrl = cfg.base_url || 'https://api.openai.com/v1';
  const apiUrl = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.api_key}`
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.3,
        stream: false
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '翻译失败';
    document.getElementById('trans-output').value = result;
  } catch (err) {
    toast('翻译失败: ' + err.message, 'error');
  }
}

function swapTranslation() {
  const srcSel = document.getElementById('trans-source-lang');
  const tgtSel = document.getElementById('trans-target-lang');
  const inputEl = document.getElementById('trans-input');
  const outputEl = document.getElementById('trans-output');

  if (srcSel.value === 'auto') { toast('自动检测不能交换', 'warning'); return; }

  // Swap languages
  const tmpLang = srcSel.value;
  srcSel.value = tgtSel.value;
  tgtSel.value = tmpLang;

  // Swap text
  const tmpText = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = tmpText;
}

// ============================================================================
// TTS 文字转语音 (tts.py)
// ============================================================================

let ttsManager = null;

function initTTS() {
  if (ttsManager) return;
  ttsManager = {
    speaking: false,
    _cleanMarkdown(text) {
      let t = text;
      t = t.replace(/```[\s\S]*?```/g, '');
      t = t.replace(/\*\*(.*?)\*\*/g, '$1');
      t = t.replace(/\*(.*?)\*/g, '$1');
      t = t.replace(/`([^`]*)`/g, '$1');
      t = t.replace(/^#+\s+/gm, '');
      t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      t = t.replace(/[-*]\s/g, '');
      t = t.replace(/^\d+\.\s/gm, '');
      return t.trim();
    },
    speak(text) {
      if (!('speechSynthesis' in window)) { toast('浏览器不支持语音合成', 'error'); return; }
      window.speechSynthesis.cancel();
      const clean = this._cleanMarkdown(text);
      const utter = new SpeechSynthesisUtterance(clean);
      const rate = state.settings.tts_rate || 1;
      const volume = state.settings.tts_volume || 1;
      utter.rate = rate;
      utter.volume = volume;
      utter.onstart = () => { this.speaking = true; };
      utter.onend = () => { this.speaking = false; };
      window.speechSynthesis.speak(utter);
    },
    stop() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.speaking = false;
    }
  };
}

function speakAIMessage(content) {
  initTTS();
  ttsManager.speak(content);
}

function stopTTS() {
  initTTS();
  ttsManager.stop();
}

// ============================================================================
// 用量统计 (stats_dialog.py)
// ============================================================================

function estimateTokens(text) {
  let chinese = 0, other = 0;
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) chinese++;
    else other++;
  }
  return Math.ceil(chinese * 1.5 + other * 0.25);
}

function getStats(sessionName) {
  const msgs = state.sessions[sessionName].messages;
  if (!msgs.length) return { name: sessionName, total: 0, user: 0, ai: 0, chars: 0, tokens: 0 };
  const userMsgs = msgs.filter(m => m.role === 'user');
  const aiMsgs = msgs.filter(m => m.role === 'assistant');
  const allText = msgs.map(m => m.content || '').join('');
  return {
    name: sessionName,
    total: msgs.length,
    user: userMsgs.length,
    ai: aiMsgs.length,
    chars: allText.length,
    tokens: estimateTokens(allText)
  };
}

function getAllStats() {
  const names = Object.keys(state.sessions);
  let totalMsgs = 0, totalChars = 0, totalTokens = 0;
  for (const name of names) {
    const s = getStats(name);
    totalMsgs += s.total;
    totalChars += s.chars;
    totalTokens += s.tokens;
  }
  return {
    sessions: names.length,
    messages: totalMsgs,
    chars: totalChars,
    tokens: totalTokens
  };
}

function showStats() {
  const current = getStats(state.currentSession);
  const global = getAllStats();
  const body = document.getElementById('stats-body');
  body.innerHTML = `
    <h3 style="margin-bottom:8px;font-size:var(--font-md);">📌 当前会话: ${escapeHtml(current.name)}</h3>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">总消息数</span><strong>${current.total}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">你的消息</span><strong>${current.user}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">AI 回复</span><strong>${current.ai}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">字符数</span><strong>${current.chars.toLocaleString()}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">预估 Token</span><strong>${current.tokens.toLocaleString()}</strong>
      </div>
    </div>
    <h3 style="margin-bottom:8px;font-size:var(--font-md);">📊 全局统计</h3>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">会话总数</span><strong>${global.sessions}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">总消息数</span><strong>${global.messages}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">总字符数</span><strong>${global.chars.toLocaleString()}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg-hover);border-radius:4px;">
        <span style="color:var(--fg-label);font-size:var(--font-sm);">总预估 Token</span><strong>${global.tokens.toLocaleString()}</strong>
      </div>
    </div>
  `;
  openModal('modal-stats');
}

// ============================================================================
// 备份/恢复 (backup/restore)
// ============================================================================

function exportSettings() {
  const data = {
    sessions: state.sessions,
    currentSession: state.currentSession,
    apiConfigs: state.apiConfigs,
    currentApi: state.currentApi,
    settings: state.settings,
    theme: state.theme,
    exportTime: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aichat_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出', 'success');
}

function importSettings(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.sessions || !data.apiConfigs) {
        toast('文件格式不正确', 'error');
        return;
      }
      if (!confirm('导入将覆盖当前所有设置和会话数据，确定继续？')) return;
      state.sessions = data.sessions;
      state.currentSession = data.currentSession || '默认会话';
      state.apiConfigs = data.apiConfigs;
      state.currentApi = data.currentApi || '';
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      state.theme = data.theme || 'light';
      saveState();
      applyTheme(state.theme);
      renderAll();
      toast('数据导入成功', 'success');
    } catch (err) {
      toast('文件解析失败: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// 更多导出格式 (export_manager.py)
// ============================================================================

function exportCSV(sessionName, messages) {
  let csv = 'Role,Content\n';
  for (const m of messages) {
    const role = m.role === 'user' ? '你' : 'AI';
    const content = '"' + (m.content || '').replace(/"/g, '""') + '"';
    csv += `${role},${content}\n`;
  }
  downloadFile(`${sessionName}.csv`, csv, 'text/csv');
}

function exportJSON(sessionName, messages) {
  const data = {
    session_name: sessionName,
    export_time: new Date().toLocaleString(),
    message_count: messages.length,
    messages: messages
  };
  downloadFile(`${sessionName}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function exportHTML(sessionName, messages) {
  let body = '';
  for (const m of messages) {
    const role = m.role === 'user' ? '你' : 'AI';
    const cls = m.role === 'user' ? 'user' : 'ai';
    const content = m.role === 'user' ? escapeHtml(m.content) : renderMarkdown(m.content);
    body += `<div class="message ${cls}"><strong>${role}</strong><div class="content">${content}</div></div>`;
  }
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(sessionName)}</title>
<style>
  body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f6fa;}
  .message{margin-bottom:20px;padding:12px;border-radius:8px;}
  .user{border-left:4px solid #0084ff;background:#fff;}
  .ai{border-left:4px solid #00a67e;background:#fff;}
  .content{margin-top:6px;line-height:1.6;}
  pre{background:#f8f9fa;padding:10px;border-radius:4px;overflow-x:auto;}
  code{font-family:monospace;font-size:13px;}
</style></head><body>
<h1>${escapeHtml(sessionName)}</h1>
<p>导出时间: ${new Date().toLocaleString()}</p>
<hr>${body}
</body></html>`;
  downloadFile(`${sessionName}.html`, html, 'text/html');
}

function exportAllSessions() {
  const data = {
    export_time: new Date().toLocaleString(),
    session_count: Object.keys(state.sessions).length,
    sessions: {}
  };
  for (const [name, session] of Object.entries(state.sessions)) {
    data.sessions[name] = {
      message_count: session.messages.length,
      messages: session.messages
    };
  }
  downloadFile(`aichat_all_sessions_${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

function showExportOptions() {
  const msgs = getCurrentMessages();
  if (!msgs.length) { toast('当前会话无消息', 'warning'); return; }
  const body = document.getElementById('export-format-body');
  const formats = [
    { label: '📝 Markdown', fn: () => exportChat() },
    { label: '📄 CSV', fn: () => exportCSV(state.currentSession, msgs) },
    { label: '📋 JSON', fn: () => exportJSON(state.currentSession, msgs) },
    { label: '🌐 HTML', fn: () => exportHTML(state.currentSession, msgs) },
    { label: '📦 全部会话', fn: () => exportAllSessions() }
  ];
  body.innerHTML = formats.map((f, i) =>
    `<button onclick="closeModal('modal-export-format');(${f.fn.toString()})();" style="padding:10px 16px;border:1px solid var(--border);border-radius:6px;background:var(--bg-hover);color:var(--fg-text);cursor:pointer;text-align:left;font-size:var(--font-sm);">${f.label}</button>`
  ).join('');
  openModal('modal-export-format');
}

// ============================================================================
// 更多主题 (theme.py)
// ============================================================================

const THEMES = {
  light: { name: 'light', displayName: '浅色模式', logo: '#0084ff' },
  dark: { name: 'dark', displayName: '深色模式', logo: '#6c5ce7' },
  blue: { name: 'blue', displayName: '海洋蓝', logo: '#0066cc' },
  green: { name: 'green', displayName: '森林绿', logo: '#2e7d32' },
  purple: { name: 'purple', displayName: '梦幻紫', logo: '#7b1fa2' },
  ocean: { name: 'ocean', displayName: '深海', logo: '#006994' },
  sunset: { name: 'sunset', displayName: '日落橙', logo: '#e65100' },
  midnight: { name: 'midnight', displayName: '午夜', logo: '#1a1a2e' },
  nordic: { name: 'nordic', displayName: '北欧极简', logo: '#5e6771' },
  coffee: { name: 'coffee', displayName: '咖啡棕', logo: '#6d4c41' },
  lavender: { name: 'lavender', displayName: '薰衣草', logo: '#8e24aa' },
  crimson: { name: 'crimson', displayName: '深红', logo: '#d32f2f' },
  teal: { name: 'teal', displayName: '青绿', logo: '#00796b' }
};

function setTheme(name) {
  state.theme = name;
  document.documentElement.setAttribute('data-theme', name);
  const isDark = ['dark','midnight','crimson'].includes(name);
  document.getElementById('hljs-light').disabled = isDark;
  document.getElementById('hljs-dark').disabled = !isDark;
  saveState();
  closeAllModals();
  toast(`已切换到 ${THEMES[name].displayName}`, 'info');
}

function buildThemePicker() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  grid.innerHTML = Object.values(THEMES).map(t =>
    `<div onclick="setTheme('${t.name}')" style="padding:12px;border-radius:8px;cursor:pointer;border:2px solid ${state.theme === t.name ? 'var(--accent-primary)' : 'transparent'};background:${t.logo};color:#fff;display:flex;flex-direction:column;align-items:center;gap:4px;transition:border-color 0.2s;">
      <span style="font-weight:700;font-size:var(--font-sm);">${t.displayName}</span>
      <span style="font-size:10px;opacity:0.8;">${state.theme === t.name ? '✓ 当前' : ''}</span>
    </div>`
  ).join('');
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = ['dark','midnight','crimson'].includes(theme);
  document.getElementById('hljs-light').disabled = isDark;
  document.getElementById('hljs-dark').disabled = !isDark;
}

// ============================================================================
// 快捷键 (shortcutter.py)
// ============================================================================

const SHORTCUTS = {
  'send': { key: 'Enter', meta: '' },
  'newSession': { key: 'n', meta: 'Control' },
  'deleteSession': { key: 'Delete', meta: 'Control' },
  'clearChat': { key: 'l', meta: 'Control' },
  'search': { key: 'f', meta: 'Control' },
  'export': { key: 'e', meta: 'Control' },
  'apiSettings': { key: ',', meta: 'Control' },
  'theme': { key: 't', meta: 'Control' },
  'fontIncrease': { key: '+', meta: 'Control' },
  'fontDecrease': { key: '-', meta: 'Control' },
  'fontReset': { key: '0', meta: 'Control' },
  'selectAll': { key: 'a', meta: 'Control' },
  'copy': { key: 'c', meta: 'Control' },
  'paste': { key: 'v', meta: 'Control' },
  'undoInput': { key: 'z', meta: 'Control' },
  'shortcuts': { key: 'F1', meta: '' },
  'close': { key: 'Escape', meta: '' }
};

function handleShortcuts(e) {
  // Don't handle shortcuts when modal is open
  const anyModalOpen = document.querySelector('.modal:not(.hidden)');
  if (anyModalOpen) return;

  const input = document.getElementById('msg-input');
  const isInputFocused = document.activeElement === input;

  // Enter to send (only when input focused)
  if (e.key === 'Enter' && isInputFocused && !e.shiftKey) {
    e.preventDefault();
    handleSend();
    return;
  }

  // Escape to close modals (already handled globally, but here too)
  if (e.key === 'Escape') {
    closeAllModals();
    return;
  }

  // Ctrl combinations
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === 'n') { e.preventDefault(); document.getElementById('btn-new-session').click(); }
    else if (key === 'e') { e.preventDefault(); showExportOptions(); }
    else if (key === 'f') { e.preventDefault(); openModal('modal-search'); }
    else if (key === ',') { e.preventDefault(); openModal('modal-api'); }
    else if (key === 't') { e.preventDefault(); document.getElementById('btn-theme').click(); }
    else if (key === 'l') { e.preventDefault(); clearCurrentSession(); }
    else if (key === '+') { e.preventDefault(); increaseFontSize(); }
    else if (key === '-') { e.preventDefault(); decreaseFontSize(); }
    else if (key === '0') { e.preventDefault(); resetFontSize(); }
    else if (key === 'a' && isInputFocused) { e.preventDefault(); input.select(); }
    else if (key === 'z' && isInputFocused) { e.preventDefault(); /* undo not easily supported in contenteditable */ }
  }
}

function increaseFontSize() {
  state.settings.font_size = Math.min(20, state.settings.font_size + 1);
  saveState();
  renderAll();
  toast(`字体: ${state.settings.font_size}px`, 'info');
}

function decreaseFontSize() {
  state.settings.font_size = Math.max(11, state.settings.font_size - 1);
  saveState();
  renderAll();
  toast(`字体: ${state.settings.font_size}px`, 'info');
}

function resetFontSize() {
  state.settings.font_size = 14;
  saveState();
  renderAll();
  toast('字体已重置为 14px', 'info');
}

function showShortcutsHelp() {
  const body = document.getElementById('shortcuts-body');
  const shortcuts = [
    ['Enter', '发送消息'],
    ['Ctrl + N', '新建会话'],
    ['Ctrl + Delete', '删除会话'],
    ['Ctrl + L', '清空对话'],
    ['Ctrl + F', '搜索消息'],
    ['Ctrl + E', '导出对话'],
    ['Ctrl + ,', 'API 设置'],
    ['Ctrl + T', '切换主题'],
    ['Ctrl + +', '放大字体'],
    ['Ctrl + -', '缩小字体'],
    ['Ctrl + 0', '重置字体'],
    ['F1', '快捷键帮助'],
    ['Escape', '关闭弹窗']
  ];
  body.innerHTML = shortcuts.map(([key, desc]) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);">
      <kbd style="padding:2px 8px;background:var(--bg-hover);border-radius:4px;font-size:var(--font-xs);border:1px solid var(--border);">${key}</kbd>
      <span style="font-size:var(--font-sm);color:var(--fg-text);">${desc}</span>
    </div>`
  ).join('');
  openModal('modal-shortcuts');
}

// ============================================================================
// 代理配置 (proxy)
// ============================================================================

function saveSettings() {
  state.settings.temperature = parseFloat(document.getElementById('set-temperature').value);
  state.settings.max_tokens = parseInt(document.getElementById('set-max-tokens').value);
  state.settings.top_p = parseFloat(document.getElementById('set-top-p').value);
  state.settings.font_size = parseInt(document.getElementById('set-font-size').value);
  state.settings.proxy_enabled = document.getElementById('set-proxy-enabled').checked;
  state.settings.proxy_url = document.getElementById('set-proxy-url').value.trim();
  saveState();
  closeModal('modal-settings');
  renderAll();
  toast('设置已保存', 'success');
}

// ============================================================================
// 单条消息导出
// ============================================================================

function exportSingleMessage(index) {
  const msgs = getCurrentMessages();
  if (!msgs[index]) { toast('消息不存在', 'error'); return; }
  const m = msgs[index];
  const role = m.role === 'user' ? '你' : 'AI';
  const text = `${role}: ${m.content}`;
  downloadFile(`message_${index + 1}_${Date.now()}.txt`, text, 'text/plain');
  toast('消息已导出', 'success');
}

// ============================================================================
// 快捷键帮助
// ============================================================================

function showShortcutsHelp() {
  const body = document.getElementById('shortcuts-body');
  const shortcuts = [
    ['Enter', '发送消息'],
    ['Ctrl + N', '新建会话'],
    ['Ctrl + Delete', '删除会话'],
    ['Ctrl + L', '清空对话'],
    ['Ctrl + F', '搜索消息'],
    ['Ctrl + E', '导出对话'],
    ['Ctrl + ,', 'API 设置'],
    ['Ctrl + T', '切换主题'],
    ['Ctrl + +', '放大字体'],
    ['Ctrl + -', '缩小字体'],
    ['Ctrl + 0', '重置字体'],
    ['F1', '快捷键帮助'],
    ['Escape', '关闭弹窗']
  ];
  body.innerHTML = shortcuts.map(([key, desc]) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);">
      <kbd style="padding:2px 8px;background:var(--bg-hover);border-radius:4px;font-size:var(--font-xs);border:1px solid var(--border);">${key}</kbd>
      <span style="font-size:var(--font-sm);color:var(--fg-text);">${desc}</span>
    </div>`
  ).join('');
  openModal('modal-shortcuts');
}

// ============================================================================
// 工具函数
// ============================================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    document.getElementById('scroll-anchor')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ============================================================================
// Supabase Auth 登录/注册/登出
// ============================================================================

function showAuthUI() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('auth-error').textContent = '';
}

function hideAuthUI() {
  document.getElementById('auth-container').classList.add('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
}

function setAuthLoading(loading) {
  const forms = document.querySelectorAll('#login-form, #register-form');
  const loadingEl = document.getElementById('auth-loading');
  forms.forEach(f => {
    const btn = f.querySelector('.auth-submit-btn');
    if (btn) btn.disabled = loading;
  });
  if (loading) {
    loadingEl.classList.remove('hidden');
  } else {
    loadingEl.classList.add('hidden');
  }
}

function handleLogin(email, password) {
  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }

  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    console.error('[Auth] supabaseClient 未定义，无法登录');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.signInWithPassword({ email, password })
    .then(({ data, error }) => {
      if (error) {
        let msg = '登录失败';
        if (error.message.includes('Invalid login credentials')) msg = '邮箱或密码错误';
        else if (error.message.includes('Email not confirmed')) msg = '请先确认邮箱';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
        console.error('[Auth] 登录错误:', error.message);
      } else {
        console.log('[Auth] 登录成功:', data?.user?.email);
      }
    })
    .catch(err => {
      console.error('[Auth] 登录异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function handleRegister(email, password, confirmPassword) {
  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }
  if (password.length < 6) {
    showAuthError('密码至少需要6位');
    return;
  }
  if (password !== confirmPassword) {
    showAuthError('两次输入的密码不一致');
    return;
  }

  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    console.error('[Auth] supabaseClient 未定义，无法注册');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.signUp({ email, password })
    .then(({ data, error }) => {
      if (error) {
        let msg = '注册失败';
        if (error.message.includes('already registered')) msg = '该邮箱已被注册，请直接登录';
        else if (error.message.includes('rate limit')) msg = '操作太频繁，请稍等几分钟再试';
        else if (error.message.includes('Password')) msg = '密码强度不足，请使用更复杂的密码';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
        console.error('[Auth] 注册错误:', error.message);
      } else {
        console.log('[Auth] 注册成功:', data?.user?.email);
        toast('注册成功！请检查邮箱确认（如已关闭邮箱确认则直接登录）', 'success');
      }
    })
    .catch(err => {
      console.error('[Auth] 注册异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function skipAuth() {
  console.log('[Auth] 用户选择跳过登录，进入离线模式');
  state.authState.loading = false;
  state.authState.user = null;
  hideAuthUI();
  updateUserUI();
  loadState();
  renderAll();
  toast('已进入离线模式，数据保存在本地浏览器', 'info');
}

function handleResetPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    showAuthError('请先输入邮箱地址');
    return;
  }
  if (!supabaseClient) {
    showAuthError('认证服务未初始化，请刷新页面后重试');
    return;
  }

  setAuthLoading(true);
  showAuthError('');

  supabaseClient.auth.resetPasswordForEmail(email)
    .then(({ error }) => {
      if (error) {
        let msg = '发送失败';
        if (error.message.includes('rate limit')) msg = '操作太频繁，请稍等几分钟再试';
        else if (error.message.includes('fetch')) msg = '网络连接失败，请检查网络或切换WiFi/流量';
        else msg = error.message;
        showAuthError(msg);
      } else {
        toast('重置密码邮件已发送，请检查邮箱', 'success');
      }
    })
    .catch(err => {
      console.error('[Auth] 重置密码异常:', err);
      showAuthError('网络连接失败，请检查网络或切换WiFi/流量');
    })
    .finally(() => setAuthLoading(false));
}

function handleLogout() {
  if (!confirm('确定退出登录？\n退出后需要重新登录才能使用。')) return;
  if (!supabaseClient) {
    toast('认证服务不可用', 'error');
    return;
  }
  supabaseClient.auth.signOut()
    .then(() => console.log('[Auth] 已退出登录'))
    .catch(err => toast('退出失败: ' + err.message, 'error'));
}

// ============================================================================
// Supabase 云端同步
// ============================================================================

async function syncApiConfigsFromCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', state.authState.user.id)
      .maybeSingle();

    if (error) throw error;

    if (data && data.api_configs && Object.keys(data.api_configs).length > 0) {
      state.apiConfigs = data.api_configs;
    }
    if (data && data.current_api && state.apiConfigs[data.current_api]) {
      state.currentApi = data.current_api;
    } else if (data && Object.keys(state.apiConfigs).length > 0) {
      state.currentApi = Object.keys(state.apiConfigs)[0] || '';
    }

    if (data && data.sessions && typeof data.sessions === 'object' && Object.keys(data.sessions).length > 0) {
      state.sessions = data.sessions;
      if (!state.currentSession || !state.sessions[state.currentSession]) {
        state.currentSession = Object.keys(state.sessions)[0];
      }
    }
  } catch (err) {
    console.error('从云端加载数据失败:', err);
    toast('云端同步失败，使用本地缓存', 'warning');
  }
}

async function syncApiConfigsToCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from('user_settings')
      .upsert({
        user_id: state.authState.user.id,
        api_configs: state.apiConfigs,
        current_api: state.currentApi,
        sessions: state.sessions,
        current_session: state.currentSession,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (err) {
    console.error('同步数据到云端失败:', err);
  }
}

async function migrateLocalToCloud() {
  if (!state.authState.user || !supabaseClient) return;

  try {
    const saved = localStorage.getItem('aichat_web_state');
    if (!saved) return;
    const localData = JSON.parse(saved);
    const localConfigs = localData.apiConfigs || {};
    const localSessions = localData.sessions || {};

    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', state.authState.user.id)
      .maybeSingle();

    if (error) throw error;

    const cloudHasConfigs = data && data.api_configs && Object.keys(data.api_configs).length > 0;
    const cloudHasSessions = data && data.sessions && Object.keys(data.sessions).length > 0;
    const localHasConfigs = Object.keys(localConfigs).length > 0;
    const localHasSessions = Object.keys(localSessions).length > 0;

    if (cloudHasConfigs || cloudHasSessions) {
      if (localHasConfigs) {
        const merged = { ...localConfigs, ...(data.api_configs || {}) };
        state.apiConfigs = merged;
        state.currentApi = data.current_api || Object.keys(merged)[0] || '';
      }
      if (localHasSessions) {
        const mergedSessions = { ...(data.sessions || {}), ...localSessions };
        state.sessions = mergedSessions;
        state.currentSession = data.current_session || state.currentSession || Object.keys(mergedSessions)[0];
      }
      await syncApiConfigsToCloud();
      toast('已合并本地和云端的会话数据', 'info');
    } else if (localHasConfigs || localHasSessions) {
      state.apiConfigs = localConfigs;
      state.currentApi = localData.currentApi || Object.keys(localConfigs)[0] || '';
      state.sessions = localSessions;
      state.currentSession = localData.currentSession || Object.keys(localSessions)[0] || '默认会话';
      await syncApiConfigsToCloud();
      toast('已将本地数据迁移到云端', 'success');
    }
  } catch (err) {
    console.error('迁移本地数据失败:', err);
  }
}

// ============================================================================
// 初始化
// ============================================================================

function updateUserUI() {
  const userEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('btn-logout');
  if (!userEl || !logoutBtn) {
    console.error('[UI] user-email 或 btn-logout 元素未找到');
    return;
  }
  if (state.authState.user) {
    const email = state.authState.user.email;
    console.log('[UI] 更新用户显示:', email);
    userEl.textContent = email;
    userEl.title = email;
    userEl.style.removeProperty('display');
    logoutBtn.style.removeProperty('display');
  } else {
    console.log('[UI] 清除用户显示');
    userEl.textContent = '';
    userEl.title = '当前登录用户';
    userEl.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

function bindAppEvents() {
  // 发送按钮
  const sendBtn = document.getElementById('btn-send');
  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.isStreaming) {
      stopStreaming();
    } else {
      handleSend();
    }
  });

  // Enter 发送
  document.getElementById('msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 新建会话
  document.getElementById('btn-new-session').addEventListener('click', () => {
    const name = prompt('输入会话名称（留空自动生成）:');
    createSession(name);
  });

  // 删除会话
  document.getElementById('btn-delete-session').addEventListener('click', () => {
    deleteSession(state.currentSession);
  });

  // 清空对话
  document.getElementById('btn-clear').addEventListener('click', clearCurrentSession);

  // 导出
  document.getElementById('btn-export').addEventListener('click', showExportOptions);

  // 主题切换器
  document.getElementById('btn-theme').addEventListener('click', () => {
    buildThemePicker();
    openModal('modal-theme-picker');
  });

  // 退出登录
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // API 弹窗
  document.getElementById('btn-api').addEventListener('click', () => openModal('modal-api'));
  document.getElementById('btn-save-api').addEventListener('click', saveApiConfig);
  document.getElementById('btn-cancel-edit').addEventListener('click', cancelEdit);

  // 余额按钮
  document.getElementById('btn-balance').addEventListener('click', checkBalance);

  // 提示词弹窗
  document.getElementById('btn-prompt').addEventListener('click', () => openModal('modal-prompt'));
  document.getElementById('btn-save-prompt').addEventListener('click', savePrompt);

  // 设置弹窗
  document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));

  // 搜索弹窗
  document.getElementById('btn-search').addEventListener('click', () => openModal('modal-search'));
  document.getElementById('search-input').addEventListener('input', searchMessages);

  // 统计按钮
  document.getElementById('btn-stats').addEventListener('click', showStats);

  // 翻译按钮
  document.getElementById('btn-translation').addEventListener('click', () => openModal('modal-translation'));

  // 翻译相关
  document.getElementById('btn-trans-translate').addEventListener('click', () => {
    const text = document.getElementById('trans-input').value.trim();
    if (!text) { toast('请输入要翻译的文本', 'warning'); return; }
    const source = document.getElementById('trans-source-lang').value;
    const target = document.getElementById('trans-target-lang').value;
    doTranslate(source, target, text);
  });
  document.getElementById('btn-trans-clear').addEventListener('click', () => {
    document.getElementById('trans-input').value = '';
    document.getElementById('trans-output').value = '';
  });
  document.getElementById('btn-trans-copy').addEventListener('click', () => {
    const output = document.getElementById('trans-output');
    if (!output.value) { toast('没有可复制的内容', 'warning'); return; }
    navigator.clipboard.writeText(output.value).then(() => toast('已复制', 'success'));
  });
  document.getElementById('btn-trans-swap').addEventListener('click', swapTranslation);

  // 重命名
  document.getElementById('btn-rename-ok').addEventListener('click', doRename);
  document.getElementById('btn-rename-cancel').addEventListener('click', () => closeModal('modal-rename'));

  // 备份/恢复
  document.getElementById('btn-export-data').addEventListener('click', exportSettings);
  document.getElementById('btn-import-data').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', e => {
    if (e.target.files.length > 0) {
      importSettings(e.target.files[0]);
      e.target.value = '';
    }
  });

  // 模型切换
  document.getElementById('model-select').addEventListener('change', e => {
    state.currentApi = e.target.value;
    saveState();
    syncApiConfigsToCloud();
    renderModelLabel();
  });

  // 弹窗关闭按钮
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });

  // 点击遮罩关闭
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAllModals();
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // 快捷键
  document.addEventListener('keydown', handleShortcuts);

  // 设置面板实时更新
  document.getElementById('set-temperature').addEventListener('input', e => {
    document.getElementById('temp-val').textContent = e.target.value;
  });
  document.getElementById('set-top-p').addEventListener('input', e => {
    document.getElementById('topp-val').textContent = e.target.value;
  });
  document.getElementById('set-font-size').addEventListener('input', e => {
    document.getElementById('font-val').textContent = e.target.value + 'px';
  });
  document.getElementById('set-max-tokens').addEventListener('change', saveSettings);
  document.getElementById('set-temperature').addEventListener('change', saveSettings);
  document.getElementById('set-top-p').addEventListener('change', saveSettings);
  document.getElementById('set-font-size').addEventListener('change', saveSettings);

  // 登录 tab 切换
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
      document.getElementById('auth-error').textContent = '';
    });
  });

  // 登录表单提交
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    console.log('[Auth] 登录表单提交');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    handleLogin(email, password);
  });

  // 注册表单提交
  document.getElementById('register-form').addEventListener('submit', e => {
    e.preventDefault();
    console.log('[Auth] 注册表单提交');
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPwd = document.getElementById('reg-password-confirm').value;
    handleRegister(email, password, confirmPwd);
  });

  // 手机端汉堡菜单
  const sidebar = document.getElementById('sidebar');
  const mask = document.getElementById('sidebar-mask');
  document.getElementById('btn-menu').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    mask.classList.toggle('show');
  });
  mask.addEventListener('click', () => {
    sidebar.classList.remove('open');
    mask.classList.remove('show');
  });

  // 跳过登录
  document.getElementById('btn-skip-auth').addEventListener('click', skipAuth);

  // 忘记密码
  document.getElementById('forgot-password').addEventListener('click', e => {
    e.preventDefault();
    handleResetPassword();
  });

  scrollToBottom();
}

function init() {
  console.log('[App] 初始化开始...');
  console.log('[App] supabaseClient:', supabaseClient ? '已就绪' : '未加载!');

  // 先加载本地数据
  loadLocalStateOnly();

  // 应用主题
  applyTheme(state.theme);

  // 绑定应用事件
  bindAppEvents();

  // 若 Supabase SDK 未加载，直接进入离线模式
  if (!supabaseClient) {
    console.warn('[App] Supabase 未加载，进入离线模式');
    state.authState.loading = false;
    showAuthUI();
    updateUserUI();
    loadState();
    renderAll();
    return;
  }

  showAuthUI();

  // 监听 Supabase Auth 状态
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] 状态变化:', event, session?.user?.email || '(未登录)');

    const user = session?.user ?? null;
    state.authState.user = user;
    state.authState.loading = false;

    if (user) {
      hideAuthUI();
      updateUserUI();
      await syncApiConfigsFromCloud();
      await migrateLocalToCloud();
      renderAll();
    } else {
      showAuthUI();
      updateUserUI();
      loadState();
      renderAll();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
