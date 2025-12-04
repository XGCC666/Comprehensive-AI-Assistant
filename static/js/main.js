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
    // 只有在配置了 Key 之后才尝试获取模型
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
        if (sel) sel.innerHTML = prompts.map(p => `<option value="${p}">${p.replace('.md', '')}</option>`).join('');
        
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
        // 确保 availableThemes 始终是一个数组
        const fetchedThemes = await res.json();
        if (Array.isArray(fetchedThemes) && fetchedThemes.length > 0) {
            availableThemes = fetchedThemes;
        } else {
            // 如果主题加载失败或为空，提供默认主题兜底（这里依赖于 themes.json 中的 dark 主题）
            availableThemes = [{
                "id": "dark", 
                "name": "默认主题", 
                "colors": {
                    "--bg-color": "#343541", "--sidebar-bg": "#202123", "--input-bg": "#40414f",
                    "--text-color": "#ececf1", "--text-secondary": "#aaa", "--hover-bg": "#2a2b32",
                    "--border-color": "#4d4d4f", "--user-msg-bg": "#343541", "--ai-msg-bg": "#444654",
                    "--accent-color": "#19c37d", "--panel-bg": "#2b2d31", "--panel-input-bg": "#1e1f22",
                    "--code-bg": "#0d1117", "--inline-code-bg": "rgba(255,255,255,0.1)", "--inline-code-color": "#ececf1"
                }
            }];
        }
    } catch(e) { 
        console.error("加载主题失败:", e);
        // 如果后端不可用，也提供默认主题
        availableThemes = [{id:'dark', name:'默认主题', colors:{}}]; 
    }
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
            // === 修复：确保顶部栏模型选择器被正确填充和选中 ===
            const headerSel = document.getElementById('chat-model-sel');
            const currentModel = document.getElementById('cfg-model').value; // 从配置中获取当前使用的模型
            if(headerSel) {
                headerSel.innerHTML = data.models.map(m => `<option value="${m}">${m}</option>`).join('');
                // 尝试选中当前模型，如果不存在则选中第一个
                if (data.models.includes(currentModel)) {
                    headerSel.value = currentModel;
                } else if (data.models.length > 0) {
                    headerSel.value = data.models[0];
                }
            }
            // ===============================================

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
    
    // 发送配置到后端
    const res = await fetch('/api/save_config', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const data = await res.json();

    if (data.status === 'success') {
        alert("✅ 配置保存成功，AI 引擎已连接");
        // 重新检查配置，更新UI状态
        checkApiConfig(); 
        // 重新获取模型列表 (静默模式)，确保顶部栏模型选择器能更新
        fetchModels(true);
    } else {
         alert(`❌ 配置保存成功，但连接失败: ${data.message || '请检查 Key 和 URL'}`);
    }
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
    
    // 自动调整输入框高度 (确保下次输入时高度重置)
    inp.style.height = '24px'; 

    const aiDiv = addMsg('assistant', '...');
    const src = new EventSource(`/api/chat_stream?message=${encodeURIComponent(txt)}`);
    let full = "", first = true;
    
    src.onmessage = e => {
        try {
            const data = JSON.parse(e.data);
            
            if(first) { 
                aiDiv.innerHTML = ''; 
                first = false; 
                // 确保聊天记录滚动到底部，特别是当第一块数据来临时
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            
            // 检查是否有错误信息，如果有则只显示错误
            if (data.error) {
                full = `❌ ${data.error}`;
                src.close();
            } else {
                full += data.text || '';
            }
            
            aiDiv.innerHTML = marked.parse(full);
            aiDiv.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch(err){
            // 捕获 JSON 解析错误
            console.error("EventSource data error:", err);
            src.close();
        }
    };
    
    src.onerror = () => { 
        src.close(); 
        // 修复：流结束后需要重新加载历史，以更新自动生成的标题
        loadHistory(); 
    };
}

// 6. 顶部栏即时切换
async function updateChatSettings(type) {
    const val = document.getElementById(type === 'model' ? 'chat-model-sel' : 'chat-role-sel').value;
    const payload = type === 'model' ? {model: val} : {prompt_file: val};
    
    // 尝试更新设置
    const res = await fetch('/api/chat/update_settings', {
        method:'POST', headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.status === 'success') {
        // 如果是切换角色（prompt_file），则需要更新聊天的 system 消息
        if (type === 'role') {
            alert(`✅ 角色切换成功: ${val.replace('.md', '')}`);
            // 重新加载当前对话，以确保显示新的 greeting 或 system 消息
            loadOld(data.data.id); 
        } else {
            alert(`✅ 模型切换成功: ${val}`);
        }
    } else {
        alert(`❌ 切换失败: ${data.error || data.message}`);
    }
}

// 7. 历史与启动
function startChat() {
    const sel = document.getElementById('role-sel');
    if(!sel.value) return alert("请选择一个助手角色");
    
    // 隐藏聊天提示
    chatBox.innerHTML = ''; 

    fetch('/api/new_chat', {
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({filename: sel.value})
    })
    .then(res => res.json())
    .then(data => {
        closeModal('role-modal');
        
        // 渲染欢迎语
        addMsg('assistant', data.greeting);
        
        // 更新历史记录列表
        loadHistory();
        
        // 设置顶部栏
        document.getElementById('chat-header').style.display = 'flex';
        document.getElementById('chat-role-sel').value = sel.value;
        document.getElementById('chat-model-sel').value = data.model;
    })
    .catch(e => {
        alert("创建新对话失败，请检查 API 配置是否正确");
        console.error(e);
    });
}

async function loadOld(id) {
    const res = await fetch('/api/load_chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id: id})});
    const data = await res.json();
    
    if (data.error) {
        alert(`加载对话失败: ${data.error}`);
        return;
    }

    chatBox.innerHTML = '';
    document.getElementById('chat-header').style.display = 'flex';
    
    // 确保顶部栏模型和角色被选中
    if(data.model) document.getElementById('chat-model-sel').value = data.model;
    if(data.prompt_file) document.getElementById('chat-role-sel').value = data.prompt_file;
    
    // 渲染所有消息 (跳过第一个 system 消息)
    data.messages.slice(1).forEach(m => addMsg(m.role, m.content));
}

async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const chats = await res.json();
        const list = document.getElementById('history-list');
        if(!list) return;
        
        if(chats.length===0) {
            list.innerHTML = '<div style="padding:10px;opacity:0.6">暂无历史</div>';
        } else {
            // === 修复：确保历史记录 HTML 结构正确，包含操作按钮容器 ===
            list.innerHTML = chats.map(c => `
                <div class="history-item" onclick="loadOld('${c.id}')">
                    <span class="chat-title">${c.title || '新对话'}</span>
                    <div class="action-btns">
                        <div class="btn-icon btn-edit" onclick="event.stopPropagation();renameChat('${c.id}','${c.title}')" title="重命名">✎</div>
                        <div class="btn-icon btn-delete" onclick="event.stopPropagation();deleteChat('${c.id}')" title="删除">🗑️</div>
                    </div>
                </div>
            `).join('');
            // =======================================================
        }
    } catch(e){
        console.error("加载历史记录失败:", e);
        const list = document.getElementById('history-list');
        if(list) list.innerHTML = '<div style="padding:10px;opacity:0.6">加载历史失败 (后端连接错误)</div>';
    }
}

async function deleteChat(id) {
    if(!confirm("确认删除此对话记录？")) return;
    
    const res = await fetch('/api/delete_chat', {
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({chat_id: id})
    });
    
    const data = await res.json();
    
    if (data.status === 'success') {
        loadHistory();
        
        // 如果删除的是当前打开的对话，清空聊天框并隐藏头部
        // 这里依赖于后端 history_mgr.py 确保后端 current_chat_id 被清空
        chatBox.innerHTML = '<div style="text-align:center; color:var(--text-secondary); margin-top:10vh;"><h2>My AI Assistant</h2><p>点击左上角“+”开启新对话</p></div>';
        document.getElementById('chat-header').style.display = 'none';
    } else {
        alert("删除失败: " + (data.message || "请检查后端日志"));
    }
}

async function renameChat(id, old) {
    const n = prompt("重命名", old);
    if(n && n.trim()!==old) {
        await fetch('/api/rename_chat', {
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({chat_id: id, new_title: n.trim()})
        });
        loadHistory();
    }
}

// 8. 外观与弹窗
function loadSettings() {
    const f = localStorage.getItem('app_font') || '16';
    updateFont(f); document.getElementById('font-range').value = f;
    
    // 修复：确保默认主题存在
    const t = localStorage.getItem('app_theme') || 'dark';
    if (!availableThemes.find(theme => theme.id === t)) {
        applyTheme('dark'); // 如果存储的主题不存在，应用默认 dark
    } else {
        applyTheme(t);
    }

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
    localStorage.setItem('custom_ai-avatar', document.getElementById('input-ai-avatar').value);
    alert("外观已更新，重新加载以应用更改");
    location.reload();
}

function updateFont(s) {
    document.documentElement.style.setProperty('--base-size', s+'px');
    localStorage.setItem('app_font', s);
}

function openRoleModal() { document.getElementById('role-modal').style.display = 'flex'; }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// 自动调整输入框高度
function adjustTextareaHeight() {
    const minHeight = 24; // 与 CSS 保持一致
    inp.style.height = 'auto'; // 临时设置为 auto
    inp.style.height = (inp.scrollHeight > minHeight ? inp.scrollHeight : minHeight) + 'px';
}

if(inp) {
    inp.addEventListener('keydown', e => { 
        if(e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendMsg(); 
        } 
    });
    // 绑定输入事件以实现高度自动调整
    inp.addEventListener('input', adjustTextareaHeight);
    // 初始调整
    adjustTextareaHeight();
}