// 全局配置对象
const config = {
    userName: 'User',
    userAvatar: 'U', // 可以是 emoji '😎' 或图片 URL
    aiName: 'AI Assistant',
    aiAvatar: '🤖'
};

const chatBox = document.getElementById('chat-box');
const inp = document.getElementById('inp');

// 配置 marked
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
});

window.onload = async () => {
    loadSettings(); // 加载设置（包括自定义头像）
    try {
        const r1 = await fetch('/api/prompts');
        const prompts = await r1.json();
        document.getElementById('role-sel').innerHTML = prompts.map(p => `<option>${p}</option>`).join('');
        loadHistory();
    } catch(e) { console.error(e); }
};

// ============ 核心消息渲染 ============
function renderAvatar(role) {
    // 根据角色获取配置的头像
    const avatarVal = role === 'user' ? config.userAvatar : config.aiAvatar;
    
    // 判断是图片 URL 还是 Emoji/文字
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
    
    const src = new EventSource(`/api/chat_stream?message=${encodeURIComponent(txt)}`);
    let fullText = "";
    
    src.onmessage = (e) => {
        try {
            // 【关键修复】解析后端发来的 JSON 数据
            const data = JSON.parse(e.data);
            fullText += data.text; // 拼接文本
            
            // 实时渲染 Markdown
            aiContentDiv.innerHTML = marked.parse(fullText);
            
            // 实时代码高亮
            aiContentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            chatBox.scrollTop = chatBox.scrollHeight;
        } catch (err) {
            console.error("解析流式数据失败:", err);
        }
    };
    
    src.onerror = () => { src.close(); loadHistory(); };
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

async function loadHistory() {
    const r = await fetch('/api/history');
    const chats = await r.json();
    const list = document.getElementById('history-list');
    
    if(chats.length === 0) {
        list.innerHTML = '<div style="padding:10px; opacity:0.6">暂无历史</div>';
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

// 【新增】重命名函数
async function renameChat(chatId, oldTitle) {
    // 弹出输入框
    const newTitle = prompt("请输入新的对话标题:", oldTitle);
    
    // 如果用户取消或输入为空，则不做任何事
    if (newTitle === null || newTitle.trim() === "") return;
    if (newTitle === oldTitle) return; // 没变也不发请求

    try {
        const res = await fetch('/api/rename_chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                chat_id: chatId,
                new_title: newTitle.trim()
            })
        });
        
        if (res.ok) {
            loadHistory(); // 刷新列表
        } else {
            alert("重命名失败");
        }
    } catch (e) {
        console.error(e);
        alert("网络错误");
    }
}

async function deleteChat(chatId) {
    if (!confirm("确定要删除这条对话记录吗？删除后无法恢复。")) return;

    try {
        const res = await fetch('/api/delete_chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({chat_id: chatId})
        });
        
        if (res.ok) {
            // 删除成功后，刷新列表
            loadHistory();
            
            // 如果删的是当前显示的对话，清空屏幕
            // 这里我们偷个懒，直接刷新页面，或者把聊天框清空
            const currentChatTitle = document.querySelector('.history-item span')?.innerText; // 这是一个近似判断
            // 简单处理：直接刷新页面最稳妥，避免状态不一致
            // location.reload(); 
            // 或者只清空聊天框：
            document.getElementById('chat-box').innerHTML = '<div style="text-align:center; opacity:0.6; margin-top:20vh;">对话已删除</div>';
        } else {
            alert("删除失败，可能文件已不存在");
        }
    } catch (e) {
        console.error(e);
        alert("网络错误");
    }
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
    // 字体
    const f = localStorage.getItem('app_font') || '16';
    updateFont(f); document.getElementById('font-range').value = f;
    
    // 主题
    const t = localStorage.getItem('app_theme') || 'dark';
    setTheme(t);

    // 个性化信息
    config.userName = localStorage.getItem('custom_user_name') || 'User';
    config.userAvatar = localStorage.getItem('custom_user_avatar') || 'U';
    config.aiAvatar = localStorage.getItem('custom_ai_avatar') || '🤖';

    // 填充到设置输入框
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

    // 更新内存配置
    config.userName = uName;
    config.userAvatar = uAvatar;
    config.aiAvatar = aAvatar;

    alert("设置已保存，下次对话生效（或刷新页面）");
    closeModal('settings-modal');
    location.reload(); // 简单粗暴：刷新页面以应用新头像
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