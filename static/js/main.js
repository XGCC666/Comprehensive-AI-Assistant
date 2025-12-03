// ============ 全局配置 ============
const config = {
    userName: 'User',
    userAvatar: 'U',
    aiName: 'AI Assistant',
    aiAvatar: '🤖'
};

const chatBox = document.getElementById('chat-box');
const inp = document.getElementById('inp');

// marked 配置
if (typeof marked !== 'undefined') {
    marked.setOptions({
        highlight: function(code, lang) {
            if (typeof hljs === 'undefined') return code;
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    });
}

// ============ 初始化 ============
window.onload = async () => {
    // 1. 加载外观
    loadSettings();
    
    // 2. 检查 API
    await checkApiConfig(); 
    
    // 3. 加载角色列表
    try {
        const r1 = await fetch('/api/prompts');
        const prompts = await r1.json();
        const sel = document.getElementById('role-sel');
        if (sel) sel.innerHTML = prompts.map(p => `<option>${p}</option>`).join('');
    } catch(e) { console.error("加载角色失败:", e); }

    // 4. 加载历史
    loadHistory();
};

// ============ API 配置逻辑 ============
async function checkApiConfig() {
    try {
        const res = await fetch('/api/check_config');
        const data = await res.json();
        
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        
        setVal('cfg-key', data.api_key);
        setVal('cfg-url', data.base_url);
        setVal('cfg-model', data.model);
        setVal('cfg-tokens', data.max_tokens || 2000);
        setVal('cfg-temp', data.temperature || 0.7);
        
        const tempVal = document.getElementById('temp-val');
        if(tempVal) tempVal.innerText = data.temperature || 0.7;

        const streamEl = document.getElementById('cfg-stream');
        if(streamEl) streamEl.checked = data.stream !== false;

        const closeBtn = document.getElementById('btn-close-settings');
        if (!data.configured) {
            openSettings();
            if(closeBtn) closeBtn.style.display = 'none';
        } else {
            if(closeBtn) closeBtn.style.display = 'block';
        }
    } catch (e) { console.error(e); }
}

async function fetchModels() {
    const key = document.getElementById('cfg-key').value.trim();
    const url = document.getElementById('cfg-url').value.trim();
    const btn = document.getElementById('btn-fetch');
    const list = document.getElementById('model-list');
    const input = document.getElementById('cfg-model');

    if(!key || !url) { alert("请填写 Key 和 URL"); return; }

    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳'; btn.disabled = true;

    try {
        const res = await fetch('/api/fetch_models', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ api_key: key, base_url: url })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            if(list) {
                list.innerHTML = '';
                data.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    list.appendChild(opt);
                });
            }
            alert(`✅ 获取成功，共 ${data.models.length} 个模型`);
            if(input) input.focus();
        } else {
            alert("❌ " + data.message);
        }
    } catch(e) { alert("网络错误: " + e); }
    finally {
        btn.innerHTML = oldText; btn.disabled = false;
    }
}

async function saveApiConfig() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked : true; };

    const payload = {
        api_key: getVal('cfg-key'),
        base_url: getVal('cfg-url'),
        model: getVal('cfg-model'),
        temperature: parseFloat(getVal('cfg-temp') || 0.7),
        max_tokens: parseInt(getVal('cfg-tokens') || 2000),
        stream: getCheck('cfg-stream')
    };

    if(!payload.api_key || !payload.base_url) { alert("Key/URL 必填"); return; }

    const btn = document.getElementById('btn-save-api');
    const oldText = btn.innerText;
    btn.innerText = "保存中..."; btn.disabled = true;

    try {
        const res = await fetch('/api/save_config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.status === 'success') {
            alert("✅ 配置已保存");
            const closeBtn = document.getElementById('btn-close-settings');
            if(closeBtn) closeBtn.style.display = 'block';
        } else {
            alert("保存失败: " + data.message);
        }
    } catch(e) { alert("错误: " + e); }
    finally {
        btn.innerText = oldText; btn.disabled = false;
    }
}

// ============ 外观设置与个性化 (这次一定找得到元素了！) ============
function loadSettings() {
    // 字体
    const f = localStorage.getItem('app_font') || '16';
    updateFont(f); 
    const fr = document.getElementById('font-range');
    if(fr) fr.value = f;

    // 主题
    const t = localStorage.getItem('app_theme') || 'dark';
    setTheme(t);

    // 个性化
    config.userName = localStorage.getItem('custom_user_name') || 'User';
    config.userAvatar = localStorage.getItem('custom_user_avatar') || 'U';
    config.aiAvatar = localStorage.getItem('custom_ai_avatar') || '🤖';

    // 填充输入框
    const un = document.getElementById('input-username');
    if(un) un.value = config.userName;
    
    const ua = document.getElementById('input-user-avatar');
    if(ua) ua.value = config.userAvatar;
    
    const aa = document.getElementById('input-ai-avatar');
    if(aa) aa.value = config.aiAvatar;
}

function saveCustomization() {
    const un = document.getElementById('input-username');
    const ua = document.getElementById('input-user-avatar');
    const aa = document.getElementById('input-ai-avatar');
    
    if(un) localStorage.setItem('custom_user_name', un.value);
    if(ua) localStorage.setItem('custom_user_avatar', ua.value);
    if(aa) localStorage.setItem('custom_ai_avatar', aa.value);
    
    // 更新内存变量
    config.userName = un ? un.value : 'User';
    config.userAvatar = ua ? ua.value : 'U';
    config.aiAvatar = aa ? aa.value : '🤖';
    
    alert("✅ 外观设置已应用");
    // 不需要刷新页面，下次发消息就会变，或者如果你想立即看到侧边栏变化，可以 reload
    // location.reload(); 
}

function updateFont(s) {
    document.documentElement.style.setProperty('--base-size', s+'px');
    const fv = document.getElementById('font-val');
    if(fv) fv.innerText = s;
    localStorage.setItem('app_font', s);
}

function setTheme(m) {
    if(m==='light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('app_theme', m);
}

// ============ 聊天逻辑 ============
function renderAvatar(role) {
    const val = role === 'user' ? config.userAvatar : config.aiAvatar;
    if(val.includes('http') || val.includes('data:')) return `<img src="${val}">`;
    return val;
}

function renderName(role) {
    return role === 'user' ? config.userName : config.aiName;
}

function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const html = marked.parse(text);
    const nameStr = renderName(role);
    const avatarHtml = renderAvatar(role);

    div.innerHTML = `
        <div class="msg-content">
            <div class="avatar">${avatarHtml}</div>
            <div class="text-area">
                <div class="sender-name">${nameStr}</div>
                <div class="markdown-body">${html}</div>
            </div>
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    div.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    return div.querySelector('.markdown-body');
}

async function sendMsg() {
    const txt = inp.value.trim();
    if(!txt) return;
    addMsg('user', txt);
    inp.value = '';
    
    const aiDiv = addMsg('assistant', '...');
    const src = new EventSource(`/api/chat_stream?message=${encodeURIComponent(txt)}`);
    let full = "";
    let first = true;
    
    src.onmessage = (e) => {
        try {
            if(first) { aiDiv.innerHTML = ''; first = false; }
            const d = JSON.parse(e.data);
            full += d.text;
            aiDiv.innerHTML = marked.parse(full);
            aiDiv.querySelectorAll('pre code').forEach((b) => hljs.highlightElement(b));
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch(err){}
    };
    src.onerror = () => { src.close(); loadHistory(); };
}

// ============ 历史记录 ============
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const chats = await res.json();
        const list = document.getElementById('history-list');
        
        if(!list) return;

        if(chats.length === 0) {
            list.innerHTML = '<div style="padding:10px;opacity:0.6;font-size:0.9em;">暂无历史</div>';
        } else {
            list.innerHTML = chats.map(c => `
                <div class="history-item" onclick="loadOld('${c.id}')">
                    <div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1;">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                        <span class="chat-title">${c.title || '新对话'}</span>
                    </div>
                    <div class="action-btns">
                        <div class="btn-icon btn-edit" onclick="event.stopPropagation();renameChat('${c.id}','${c.title}')">✎</div>
                        <div class="btn-icon btn-delete" onclick="event.stopPropagation();deleteChat('${c.id}')">🗑️</div>
                    </div>
                </div>
            `).join('');
        }
    } catch(e) { console.error(e); }
}

async function loadOld(id) {
    try {
        const res = await fetch('/api/load_chat', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({chat_id: id})
        });
        const data = await res.json();
        chatBox.innerHTML = '';
        data.messages.slice(1).forEach(m => addMsg(m.role, m.content));
    } catch(e) {}
}

async function deleteChat(id) {
    if(!confirm('删除?')) return;
    await fetch('/api/delete_chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: id})
    });
    loadHistory();
    chatBox.innerHTML = '';
}

async function renameChat(id, old) {
    const n = prompt('重命名', old);
    if(n && n!==old) {
        await fetch('/api/rename_chat', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({chat_id: id, new_title: n})
        });
        loadHistory();
    }
}

async function startChat() {
    const sel = document.getElementById('role-sel');
    if(!sel) return;
    const res = await fetch('/api/new_chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({filename: sel.value})
    });
    const data = await res.json();
    closeModal('role-modal');
    chatBox.innerHTML = '';
    addMsg('assistant', data.greeting);
    loadHistory();
}

// 弹窗控制
function openRoleModal() { document.getElementById('role-modal').style.display = 'flex'; }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// 回车监听
if(inp) {
    inp.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
}