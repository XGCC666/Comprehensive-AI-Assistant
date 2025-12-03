import os
import json
import uuid
import datetime

HISTORY_DIR = "history"

class HistoryManager:
    def __init__(self):
        if not os.path.exists(HISTORY_DIR):
            os.makedirs(HISTORY_DIR)

    def create_new_chat(self, prompt_filename, system_content, greeting):
        """创建一个新的对话记录（仅在内存中创建，不立即存盘）"""
        chat_id = str(uuid.uuid4())[:8]
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        data = {
            "id": chat_id,
            "title": "新对话",
            "prompt_file": prompt_filename,
            "updated_at": timestamp,
            "messages": [
                {"role": "system", "content": system_content}
            ]
        }
        
        # ❌ 原来的代码：立即存盘
        # self.save_chat(chat_id, data) <--- 把这行删掉或注释掉！
        
        # ✅ 现在：只返回数据，等用户说话了再由 main.py 里的循环去保存
        return chat_id, data

    def save_chat(self, chat_id, data):
        """保存对话到 JSON"""
        filepath = os.path.join(HISTORY_DIR, f"{chat_id}.json")
        data["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_chat(self, chat_id):
        """读取指定对话"""
        filepath = os.path.join(HISTORY_DIR, f"{chat_id}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None

    def list_all_chats(self):
        """列出所有历史对话，按时间倒序排列"""
        chats = []
        files = [f for f in os.listdir(HISTORY_DIR) if f.endswith('.json')]
        
        for f in files:
            path = os.path.join(HISTORY_DIR, f)
            try:
                with open(path, 'r', encoding='utf-8') as file:
                    data = json.load(file)
                    chats.append({
                        "id": data["id"],
                        "title": data.get("title", "未命名对话"),
                        "prompt_file": data.get("prompt_file", "Unknown"),
                        "updated_at": data.get("updated_at", "")
                    })
            except:
                continue
        
        # 按时间倒序排（最近的在前面）
        chats.sort(key=lambda x: x["updated_at"], reverse=True)
        return chats

    def update_title(self, chat_id, new_title):
        """更新标题"""
        data = self.load_chat(chat_id)
        if data:
            data["title"] = new_title
            self.save_chat(chat_id, data)