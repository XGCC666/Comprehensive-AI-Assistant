from flask import Flask, render_template, request, Response, jsonify
from src.config import load_config
from src.file_loader import get_prompt_list, load_prompt_by_filename
from src.ai_engine import AIEngine
from src.history_manager import HistoryManager
import json

app = Flask(__name__)

# 初始化核心模块
config = load_config()
engine = AIEngine(config["api_key"], config["base_url"], config["model"])
history_mgr = HistoryManager()

# 全局变量
CURRENT_CHAT_ID = None
CURRENT_CHAT_DATA = None

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/prompts')
def get_prompts():
    return jsonify(get_prompt_list())

@app.route('/api/history')
def get_history():
    return jsonify(history_mgr.list_all_chats())

@app.route('/api/new_chat', methods=['POST'])
def new_chat():
    global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
    data = request.json
    filename = data.get('filename')
    
    system_content, greeting = load_prompt_by_filename(filename)
    chat_id, chat_data = history_mgr.create_new_chat(filename, system_content, greeting)
    
    CURRENT_CHAT_ID = chat_id
    CURRENT_CHAT_DATA = chat_data
    
    return jsonify({"greeting": greeting, "chat_id": chat_id, "messages": chat_data['messages']})

@app.route('/api/load_chat', methods=['POST'])
def load_chat():
    global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
    data = request.json
    chat_id = data.get('chat_id')
    
    loaded_data = history_mgr.load_chat(chat_id)
    if loaded_data:
        CURRENT_CHAT_ID = chat_id
        CURRENT_CHAT_DATA = loaded_data
        return jsonify(loaded_data)
    return jsonify({"error": "Not found"}), 404

@app.route('/api/delete_chat', methods=['POST'])
def delete_chat():
    data = request.json
    chat_id = data.get('chat_id')
    
    if history_mgr.delete_chat(chat_id):
        global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
        if CURRENT_CHAT_ID == chat_id:
            CURRENT_CHAT_ID = None
            CURRENT_CHAT_DATA = None
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "File not found"}), 404

# ========== 【新增】重命名接口 ==========
@app.route('/api/rename_chat', methods=['POST'])
def rename_chat():
    data = request.json
    chat_id = data.get('chat_id')
    new_title = data.get('new_title')
    
    if not chat_id or not new_title:
        return jsonify({"error": "Missing params"}), 400
        
    history_mgr.update_title(chat_id, new_title)
    
    # 如果当前就在聊这个天，也要更新内存里的标题
    global CURRENT_CHAT_DATA
    if CURRENT_CHAT_ID == chat_id and CURRENT_CHAT_DATA:
        CURRENT_CHAT_DATA["title"] = new_title
        
    return jsonify({"status": "success"})

@app.route('/api/chat_stream')
def chat_stream():
    """核心：流式对话接口 (修复版)"""
    global CURRENT_CHAT_DATA
    user_input = request.args.get('message')
    
    if not CURRENT_CHAT_DATA:
        return Response("Error: No chat initialized", status=400)

    CURRENT_CHAT_DATA["messages"].append({"role": "user", "content": user_input})

    def generate():
        full_response = ""
        stream = engine.chat_stream(CURRENT_CHAT_DATA["messages"])
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_response += content
                json_data = json.dumps({"text": content}, ensure_ascii=False)
                yield f"data: {json_data}\n\n"
        
        CURRENT_CHAT_DATA["messages"].append({"role": "assistant", "content": full_response})
        history_mgr.save_chat(CURRENT_CHAT_ID, CURRENT_CHAT_DATA)
        
        # ========== 【优化】自动标题逻辑 ==========
        # 条件放宽：只要是新对话，且已经有一问一答了(len>=3)，就尝试起名
        if CURRENT_CHAT_DATA["title"] == "新对话" and len(CURRENT_CHAT_DATA["messages"]) >= 3:
            try:
                print("正在生成标题...") # 后台打印日志方便调试
                new_title = engine.generate_title(user_input, full_response)
                history_mgr.update_title(CURRENT_CHAT_ID, new_title)
                CURRENT_CHAT_DATA["title"] = new_title
                print(f"标题更新为: {new_title}")
            except Exception as e:
                print(f"自动标题生成失败: {e}")

    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    print("🚀 服务器已启动: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)