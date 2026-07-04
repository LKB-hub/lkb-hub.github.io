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
    messages: buildMessages(),
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
    btn.onclick = stopStreaming;
  } else {
    btn.textContent = '发送 ▶';
    btn.onclick = handleSend;
  }
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
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendMessage(text);
}

function switchSession(name) {
  state.currentSession = name;
  saveState();
  renderAll();
  scrollToBottom();
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
  if (id === 'modal-api') renderApiList();
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
        <button class="api-use" onclick="useApi('${escapeJs(n)}')">使用</button>
        <button class="api-del" onclick="deleteApi('${escapeJs(n)}')">删除</button>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--fg-muted)">暂无配置</div>';
}

function saveApiConfig() {
  const name = document.getElementById('api-name').value.trim();
  const key = document.getElementById('api-key').value.trim();
  const url = document.getElementById('api-url').value.trim();
  const model = document.getElementById('api-model').value.trim();

  if (!name) { toast('请输入配置名称', 'warning'); return; }
  if (!key) { toast('请输入 API 密钥', 'warning'); return; }
  if (!model) { toast('请输入模型名称', 'warning'); return; }

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
  document.getElementById('api-name').value = '';
  document.getElementById('api-key').value = '';
  document.getElementById('api-url').value = '';
  document.getElementById('api-model').value = '';
  toast('API 配置已保存', 'success');
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
      showAuthError('网络错误，请检查网络连接后重试');
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
      showAuthError('网络错误，请检查网络连接后重试');
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
  } catch (err) {
    console.error('从云端加载 API 配置失败:', err);
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
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (err) {
    console.error('同步 API 配置到云端失败:', err);
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
    if (Object.keys(localConfigs).length === 0) return;

    // 检查云端是否已有数据
    const { data, error } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', state.authState.user.id)
      .maybeSingle();

    if (error) throw error;

    if (data && data.api_configs && Object.keys(data.api_configs).length > 0) {
      // 云端已有数据，合并（云端优先，本地补充）
      const cloudConfigs = data.api_configs;
      const merged = { ...localConfigs, ...cloudConfigs };
      state.apiConfigs = merged;
      state.currentApi = data.current_api || Object.keys(merged)[0] || '';
      await syncApiConfigsToCloud();
      toast('已合并本地和云端的 API 配置', 'info');
    } else {
      // 云端无数据，上传本地配置
      state.apiConfigs = localConfigs;
      state.currentApi = localData.currentApi || Object.keys(localConfigs)[0] || '';
      await syncApiConfigsToCloud();
      toast('已将本地 API 配置迁移到云端', 'success');
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
  if (state.authState.user) {
    userEl.textContent = state.authState.user.email;
    userEl.style.display = '';
    logoutBtn.style.display = '';
  } else {
    userEl.textContent = '';
    userEl.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

function bindAppEvents() {
  // 发送按钮
  document.getElementById('btn-send').addEventListener('click', handleSend);

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

  // 注册成功后自动切回登录 tab
  // (由 onAuthStateChanged 自动处理)

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

      // 从云端拉取 API 配置
      await syncApiConfigsFromCloud();

      // 迁移本地旧数据到云端（如需要）
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

document.addEventListener('DOMContentLoaded', init);
