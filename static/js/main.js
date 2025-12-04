// ============ 全局配置 ============
const config = {
    userName: 'User',
    userAvatar: 'U',
    aiName: 'AI Assistant',
    aiAvatar: '🤖'
};
let availableThemes = [];
let allModels = [];

const chatBox = document.getElementById('chat-box');
const inp = document.getElementById('inp');

// marked
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
    await fetchThemes();
    loadSettings();
    await checkApiConfig();
    await loadPrompts();
    loadHistory();
    if(document.getElementById('cfg-key').value) fetchModels(true);
};

// ============ 功能模块 ============

// 1. 加载助手列表 & 顶部栏
async function loadPrompts() {
    try {
        const r = await fetch('/api/prompts');
        const prompts = await r.json();
        
        // 填充开始弹窗
        const sel = document.getElementById('role-sel');
        if (sel) sel.innerHTML = prompts.map(p => `<option>${p}</option>`).join('');
        
        // 填充顶部栏助手
        const headerSel = document.getElementById('chat-role-sel');
        if (headerSel) headerSel.innerHTML = prompts.map(p => `<option value="${p}">${p.replace('.md','')}</option>`).join('');
    } catch(e) {}
}

// 2. 创建助手
function openCreatePromptModal() { document.getElementById('create-prompt-modal').style.display = 'flex'; }
async function createPrompt() {
    const name = document.getElementById('new-prompt-name').value.trim();
    const greeting = document.getElementById('new-prompt-greeting').value.trim();
    const content = document.getElementById('new-prompt-content').value.trim();
    
    if(!name || !content) { alert("名称和设定必填"); return; }
    
    try {
        const res = await fetch('/api/prompts/create', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, greeting, content})
        });
        const data = await res.json();
        if(data.status === 'success') {
            alert("创建成功！");
            closeModal('create-prompt-modal');
            loadPrompts();
        } else {
            alert("创建失败: " + data.message);
        }
    } catch(e) { alert("网络错误"); }
}

// 3. 主题逻辑 (含删除)
async function fetchThemes() {
    try {
        const res = await fetch('/api/themes');
        availableThemes = await res.json();
    } catch(e) { availableThemes = [{id:'dark', name:'默认', colors:{}}]; }
}

function applyTheme(id) {
    const theme = availableThemes.find(t => t.id === id);
    if (!theme) return;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(key, value);
    }
    localStorage.setItem('app_theme', id);
    renderThemeList(id);
}

function renderThemeList(activeId) {
    const list = document.getElementById('theme-list');
    if (!list) return;
    const defaultIds = ["dark", "light", "ocean", "forest", "coffee", "cyber"];
    
    list.innerHTML = availableThemes.map(t => `
        <div class="theme-card ${activeId === t.id ? 'active' : ''}" onclick="applyTheme('${t.id}')">
            <div class="preview-bg" style="background:${t.colors['--bg-color'] || '#333'}"></div>
            <div class="preview-sidebar" style="background:${t.colors['--sidebar-bg'] || '#222'}"></div>
            <div class="theme-name">${t.name}</div>
            ${!defaultIds.includes(t.id) ? `<div class="theme-del-btn" onclick="event.stopPropagation(); deleteTheme('${t.id}')">×</div>` : ''}
        </div>
    `).join('');
    list.innerHTML += `<div class="theme-card" onclick="openImportTheme()" style="border-style:dashed;justify-content:center;align-items:center;"><div style="font-size:24px;color:var(--text-secondary);">+</div></div>`;
}

async function deleteTheme(id) {
    if(!confirm("删除该主题？")) return;
    await fetch('/api/themes/delete', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id})});
    await fetchThemes();
    if(localStorage.getItem('app_theme') === id) applyTheme('dark');
    else renderThemeList(localStorage.getItem('app_theme'));
}

function openImportTheme() {
    const jsonStr = prompt("粘贴 JSON:");
    if (!jsonStr) return;
    try {
        const themeObj = JSON.parse(jsonStr);
        fetch('/api/themes/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(themeObj)})
        .then(res=>res.json()).then(d=>{
            if(d.status==='success') {
                fetchThemes().then(() => applyTheme(themeObj.id));
            } else alert("失败");
        });
    } catch(e) { alert("格式错误"); }
}

// 4. API & 模型
async function checkApiConfig() {
    try {
        const res = await fetch('/api/check_config');
        const data = await res.json();
        
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        setVal('cfg-key', data.api_key);
        setVal('cfg-url', data.base_url);
        setVal('cfg-model', data.model);
        setVal('cfg-tokens', data.max_tokens);
        setVal('cfg-temp', data.temperature);
        
        if(document.getElementById('temp-val')) document.getElementById('temp-val').innerText = data.temperature;
        if(document.getElementById('cfg-stream')) document.getElementById('cfg-stream').checked = data.stream;

        if (!data.configured) {
            openSettings();
            document.getElementById('btn-close-settings').style.display = 'none';
        } else {
            document.getElementById('btn-close-settings').style.display = 'block';
        }
    } catch (e) {}
}

async function fetchModels(silent=false) {
    const key = document.getElementById('cfg-key').value;
    const url = document.getElementById('cfg-url').value;
    const btn = document.getElementById('btn-fetch');
    
    if(!silent) {
        if(!key || !url) { alert("Key/URL 必填"); return; }
        btn.innerText = '⏳'; btn.disabled = true;
    }

    try {
        const res = await fetch('/api/fetch_models', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ api_key: key, base_url: url })});
        const data = await res.json();
        if (data.status === 'success') {
            allModels = data.models;
            const list = document.getElementById('model-list');
            if(list) {
                list.innerHTML = '';
                data.models.forEach(m => {const opt = document.createElement('option'); opt.value = m; list.appendChild(opt);});
            }
            const headerSel = document.getElementById('chat-model-sel');
            if(headerSel) {
                headerSel.innerHTML = data.models.map(m => `<option value="${m}">${m}</option>`).join('');
                headerSel.value = document.getElementById('cfg-model').value;
            }
            if(!silent) alert(`✅ 获取成功 ${data.models.length} 个`);
        } else if(!silent) alert("❌ " + data.message);
    } catch(e) { if(!silent) alert("错误"); }
    finally { if(!silent) { btn.innerText = '🔄 获取'; btn.disabled = false; } }
}

async function saveApiConfig() {
    const getVal = id => document.getElementById(id).value;
    const getCheck = id => document.getElementById(id).checked;
    
    const payload = {
        api_key: getVal('cfg-key'), base_url: getVal('cfg-url'), model: getVal('cfg-model'),
        temperature: parseFloat(getVal('cfg-temp')), max_tokens: parseInt(getVal('cfg-tokens')), stream: getCheck('cfg-stream')
    };
    if(!payload.api_key) return alert("Key 必填");
    
    await fetch('/api/save_config', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    alert("✅ 保存成功");
    document.getElementById('btn-close-settings').style.display = 'block';
}

// 5. 聊天与渲染
function renderAvatar(role) {
    const val = role === 'user' ? config.userAvatar : config.aiAvatar;
    if (val.includes('http') || val.includes('data:')) return `<img src="${val}">`;
    return val;
}

function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="msg-content">
            <div class="avatar">${renderAvatar(role)}</div>
            <div class="text-area">
                <div class="sender-name">${role==='user'?config.userName:config.aiName}</div>
                <div class="markdown-body">${marked.parse(text)}</div>
            </div>
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    div.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    return div.querySelector('.markdown-body');
}

async function sendMsg() {
    const txt = inp.value.trim();
    if(!txt) return;
    addMsg('user', txt);
    inp.value = '';
    
    const aiDiv = addMsg('assistant', '...');
    const src = new EventSource(`/api/chat_stream?message=${encodeURIComponent(txt)}`);
    let full = "", first = true;
    
    src.onmessage = e => {
        try {
            if(first) { aiDiv.innerHTML = ''; first = false; }
            full += JSON.parse(e.data).text;
            aiDiv.innerHTML = marked.parse(full);
            aiDiv.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch(err){}
    };
    src.onerror = () => { src.close(); loadHistory(); };
}

// 6. 顶部栏即时切换
async function updateChatSettings(type) {
    const val = document.getElementById(type === 'model' ? 'chat-model-sel' : 'chat-role-sel').value;
    const payload = type === 'model' ? {model: val} : {prompt_file: val};
    await fetch('/api/chat/update_settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
}

// 7. 历史与启动
async function startChat() {
    const sel = document.getElementById('role-sel');
    if(!sel.value) return;
    const res = await fetch('/api/new_chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename: sel.value})});
    const data = await res.json();
    closeModal('role-modal');
    chatBox.innerHTML = '';
    addMsg('assistant', data.greeting);
    loadHistory();
    document.getElementById('chat-header').style.display = 'block';
    document.getElementById('chat-role-sel').value = sel.value;
    document.getElementById('chat-model-sel').value = data.model;
}

async function loadOld(id) {
    const res = await fetch('/api/load_chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id: id})});
    const data = await res.json();
    chatBox.innerHTML = '';
    document.getElementById('chat-header').style.display = 'block';
    if(data.model) document.getElementById('chat-model-sel').value = data.model;
    if(data.prompt_file) document.getElementById('chat-role-sel').value = data.prompt_file;
    data.messages.slice(1).forEach(m => addMsg(m.role, m.content));
}

async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const chats = await res.json();
        const list = document.getElementById('history-list');
        if(!list) return;
        if(chats.length===0) list.innerHTML = '<div style="padding:10px;opacity:0.6">暂无历史</div>';
        else list.innerHTML = chats.map(c => `
            <div class="history-item" onclick="loadOld('${c.id}')">
                <span class="chat-title">${c.title || '新对话'}</span>
                <div class="action-btns">
                    <div class="btn-icon btn-edit" onclick="event.stopPropagation();renameChat('${c.id}','${c.title}')">✎</div>
                    <div class="btn-icon btn-delete" onclick="event.stopPropagation();deleteChat('${c.id}')">🗑️</div>
                </div>
            </div>
        `).join('');
    } catch(e){}
}

async function deleteChat(id) {
    if(!confirm("删除?")) return;
    await fetch('/api/delete_chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id: id})});
    loadHistory();
    chatBox.innerHTML = '';
    document.getElementById('chat-header').style.display = 'none';
}

async function renameChat(id, old) {
    const n = prompt("重命名", old);
    if(n && n!==old) {
        await fetch('/api/rename_chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id: id, new_title: n})});
        loadHistory();
    }
}

// 8. 外观与弹窗
function loadSettings() {
    const f = localStorage.getItem('app_font') || '16';
    updateFont(f); document.getElementById('font-range').value = f;
    const t = localStorage.getItem('app_theme') || 'dark';
    applyTheme(t);
    config.userName = localStorage.getItem('custom_user_name') || 'User';
    config.userAvatar = localStorage.getItem('custom_user_avatar') || 'U';
    config.aiAvatar = localStorage.getItem('custom_ai_avatar') || '🤖';
    document.getElementById('input-username').value = config.userName;
    document.getElementById('input-user-avatar').value = config.userAvatar;
    document.getElementById('input-ai-avatar').value = config.aiAvatar;
}

function saveCustomization() {
    localStorage.setItem('custom_user_name', document.getElementById('input-username').value);
    localStorage.setItem('custom_user_avatar', document.getElementById('input-user-avatar').value);
    localStorage.setItem('custom_ai_avatar', document.getElementById('input-ai-avatar').value);
    alert("外观已更新");
    location.reload();
}

function updateFont(s) {
    document.documentElement.style.setProperty('--base-size', s+'px');
    localStorage.setItem('app_font', s);
}

function openRoleModal() { document.getElementById('role-modal').style.display = 'flex'; }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

if(inp) inp.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });