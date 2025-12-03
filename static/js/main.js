// 全局配置对象 (默认值)
const config = {
    userName: 'User',
    userAvatar: 'U',
    aiName: 'AI Assistant',
    aiAvatar: '🤖'
};

const chatBox = document.getElementById('chat-box');
const inp = document.getElementById('inp');

// 配置 marked 代码高亮
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
});

// ============ 初始化逻辑 ============
window.onload = async () => {
    loadSettings();     // 1. 加载本地外观设置
    await checkApiConfig(); // 2. 检查后端是否有 API Key (关键步骤)
    
    // 3. 尝试加载角色列表和历史记录
    try {
        const r1 = await fetch('/api/prompts');
        const prompts = await r1.json();
        document.getElementById('role-sel').innerHTML = prompts.map(p => `<option>${p}</option>`).join('');
        loadHistory();
    } catch(e) { console.error(e); }
};

// ============ API 配置逻辑 (核心) ============
async function checkApiConfig() {
    try {
        const res = await fetch('/api/check_config');
        const data = await res.json();
        
        // 填充设置框里的旧值
        document.getElementById('cfg-key').value = data.api_key || '';
        document.getElementById('cfg-url').value = data.base_url || '';
        document.getElementById('cfg-model').value = data.model || '';

        if (!data.configured) {
            // 如果没配置，强制打开设置弹窗
            openSettings();
            // 隐藏关闭按钮，逼迫用户去填
            document.getElementById('btn-close-settings').style.display = 'none'; 
            console.log("需要配置 API Key");
        } else {
            // 如果已配置，显示关闭按钮
            document.getElementById('btn-close-settings').style.display = 'inline-block';
        }
    } catch (e) {
        console.error("连接后端失败:", e);
    }
}

async function saveApiConfig() {
    const key = document.getElementById('cfg-key').value.trim();
    const url = document.getElementById('cfg-url').value.trim();
    const model = document.getElementById('cfg-model').value.trim();

    if (!key || !url) {
        alert("API Key 和 Base URL 不能为空！");
        return;
    }

    const btn = document.getElementById('btn-save-api');
    btn.innerText = "连接中...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/save_config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ api_key: key, base_url: url, model: model })
        });
        const data = await res.json();

        if (data.status === 'success') {
            alert("✅ 连接成功！配置已保存。");
            document.getElementById('btn-close-settings').style.display = 'inline-block'; // 允许关闭
            closeModal('settings-modal');
        } else {
            alert("❌ 保存失败: " + data.message);
        }
    } catch (e) {
        alert("网络错误: " + e);
    } finally {
        btn.innerText = "💾 保存并连接";
        btn.disabled = false;
    }
}


// ============ 聊天消息渲染逻辑 ============
function renderAvatar(role) {
    const avatarVal = role === 'user' ? config.userAvatar : config.aiAvatar;
    if (avatarVal.startsWith('http') || avatarVal.startsWith('data:image')) {
        return `<img src="${avatarVal}" alt="avatar">`;
    }
    return avatarVal;
}

function renderName(role) {
    return role === 'user' ? config.userName : config.aiName;
}

function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    // 使用 marked 解析 Markdown
    const htmlContent = marked.parse(text); 
    const avatarHtml = renderAvatar(role);
    const nameStr = renderName(role);

    div.innerHTML = `
        <div class="msg-content">
            <div class="avatar">${avatarHtml}</div>
            <div class="text-area">
                <div class="sender-name">${nameStr}</div>
                <div class="markdown-body">${htmlContent}</div>
            </div>
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div.querySelector('.markdown-body');
}

async function sendMsg() {
    const txt = inp.value.trim();
    if(!txt) return;
    addMsg('user', txt);
    inp.value = '';

    const aiContentDiv = addMsg('assistant', ''); 
    
    // 发起流式请求 (适配后端 JSON 格式)
    const src = new EventSource(`/api/chat_stream?message=${encodeURIComponent(txt)}`);
    let fullText = "";
    
    src.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data); // 解析 JSON
            fullText += data.text;
            
            // 实时更新 HTML
            aiContentDiv.innerHTML = marked.parse(fullText);
            chatBox.scrollTop = chatBox.scrollHeight;
            
            // 实时应用代码高亮
            aiContentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } catch (err) {
            console.error("解析错误:", err);
        }
    };
    src.onerror = () => { src.close(); loadHistory(); };
}

// ============ 历史记录管理 (加载/删除/重命名) ============
async function loadHistory() {
    const r = await fetch('/api/history');
    const chats = await r.json();
    const list = document.getElementById('history-list');
    
    if(chats.length === 0) {
        list.innerHTML = '<div style="padding:10px; opacity:0.6; font-size:0.9em;">暂无历史</div>';
    } else {
        list.innerHTML = chats.map(c => `
            <div class="history-item" onclick="loadOld('${c.id}')">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1;">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                    <span class="chat-title">${c.title || '新对话'}</span>
                </div>
                
                <div class="action-btns">
                    <div class="btn-icon btn-edit" onclick="event.stopPropagation(); renameChat('${c.id}', '${c.title || '新对话'}')" title="重命名">
                        <svg class="icon" viewBox="0 0 24 24" style="width:0.9em; height:0.9em;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </div>
                    <div class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteChat('${c.id}')" title="删除">
                        <svg class="icon" viewBox="0 0 24 24" style="width:0.9em; height:0.9em;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

async function loadOld(id) {
    const res = await fetch('/api/load_chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({chat_id: id})
    });
    const data = await res.json();
    chatBox.innerHTML = '';
    data.messages.slice(1).forEach(m => addMsg(m.role, m.content));
}

async function deleteChat(chatId) {
    if (!confirm("确定删除吗？不可恢复。")) return;
    const res = await fetch('/api/delete_chat', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chat_id: chatId})
    });
    if (res.ok) {
        loadHistory();
        document.getElementById('chat-box').innerHTML = '<div style="text-align:center; opacity:0.6; margin-top:20vh;">对话已删除</div>';
    }
}

async function renameChat(chatId, oldTitle) {
    const newTitle = prompt("重命名对话:", oldTitle);
    if (!newTitle || newTitle === oldTitle) return;
    
    await fetch('/api/rename_chat', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ chat_id: chatId, new_title: newTitle })
    });
    loadHistory();
}

async function startChat() {
    const name = document.getElementById('role-sel').value;
    const res = await fetch('/api/new_chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({filename: name})
    });
    const data = await res.json();
    closeModal('role-modal');
    chatBox.innerHTML = '';
    addMsg('assistant', data.greeting);
    loadHistory();
}

// ============ 设置与个性化 ============
function loadSettings() {
    const f = localStorage.getItem('app_font') || '16';
    updateFont(f); document.getElementById('font-range').value = f;
    
    const t = localStorage.getItem('app_theme') || 'dark';
    setTheme(t);

    config.userName = localStorage.getItem('custom_user_name') || 'User';
    config.userAvatar = localStorage.getItem('custom_user_avatar') || 'U';
    config.aiAvatar = localStorage.getItem('custom_ai_avatar') || '🤖';

    document.getElementById('input-username').value = config.userName;
    document.getElementById('input-user-avatar').value = config.userAvatar;
    document.getElementById('input-ai-avatar').value = config.aiAvatar;
}

function saveCustomization() {
    const uName = document.getElementById('input-username').value;
    const uAvatar = document.getElementById('input-user-avatar').value;
    const aAvatar = document.getElementById('input-ai-avatar').value;

    localStorage.setItem('custom_user_name', uName);
    localStorage.setItem('custom_user_avatar', uAvatar);
    localStorage.setItem('custom_ai_avatar', aAvatar);

    config.userName = uName;
    config.userAvatar = uAvatar;
    config.aiAvatar = aAvatar;

    alert("外观设置已保存");
    closeModal('settings-modal');
    // 如果想立即看到头像变化，可以刷新，或者下次发消息时生效
    location.reload(); 
}

function updateFont(s) {
    document.documentElement.style.setProperty('--base-size', s+'px');
    document.getElementById('font-val').innerText = s;
    localStorage.setItem('app_font', s);
}
function setTheme(m) {
    if(m==='light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('app_theme', m);
}

function openRoleModal() { document.getElementById('role-modal').style.display = 'flex'; }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

inp.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});