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

# 全局变量暂存当前对话ID（简单演示用，生产环境通常用 Session）
CURRENT_CHAT_ID = None
CURRENT_CHAT_DATA = None

@app.route('/')
def home():
    """打开网页时，直接把 index.html 给用户看"""
    return render_template('index.html')

@app.route('/api/prompts')
def get_prompts():
    """前端获取角色列表"""
    return jsonify(get_prompt_list())

@app.route('/api/history')
def get_history():
    """前端获取历史记录"""
    return jsonify(history_mgr.list_all_chats())

@app.route('/api/new_chat', methods=['POST'])
def new_chat():
    """开启新对话"""
    global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
    data = request.json
    filename = data.get('filename')
    
    system_content, greeting = load_prompt_by_filename(filename)
    # 创建新对话（内存态，懒加载）
    chat_id, chat_data = history_mgr.create_new_chat(filename, system_content, greeting)
    
    CURRENT_CHAT_ID = chat_id
    CURRENT_CHAT_DATA = chat_data
    
    return jsonify({"greeting": greeting, "chat_id": chat_id, "messages": chat_data['messages']})

@app.route('/api/load_chat', methods=['POST'])
def load_chat():
    """加载旧对话"""
    global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
    data = request.json
    chat_id = data.get('chat_id')
    
    loaded_data = history_mgr.load_chat(chat_id)
    if loaded_data:
        CURRENT_CHAT_ID = chat_id
        CURRENT_CHAT_DATA = loaded_data
        return jsonify(loaded_data)
    return jsonify({"error": "Not found"}), 404

@app.route('/api/chat_stream')
def chat_stream():
    """核心：流式对话接口"""
    global CURRENT_CHAT_DATA
    user_input = request.args.get('message')
    
    if not CURRENT_CHAT_DATA:
        return Response("Error: No chat initialized", status=400)

    # 1. 记录用户输入
    CURRENT_CHAT_DATA["messages"].append({"role": "user", "content": user_input})

    def generate():
        full_response = ""
        # 2. 调用 AI 引擎
        stream = engine.chat_stream(CURRENT_CHAT_DATA["messages"])
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_response += content
                # Server-Sent Events (SSE) 格式
                yield f"data: {content}\n\n"
        
        # 3. 记录 AI 回复并保存
        CURRENT_CHAT_DATA["messages"].append({"role": "assistant", "content": full_response})
        history_mgr.save_chat(CURRENT_CHAT_ID, CURRENT_CHAT_DATA)
        
        # 自动标题逻辑 (简单版)
        if len(CURRENT_CHAT_DATA["messages"]) == 3 and CURRENT_CHAT_DATA["title"] == "新对话":
             new_title = engine.generate_title(user_input, full_response)
             history_mgr.update_title(CURRENT_CHAT_ID, new_title)
             # 发送一个特殊信号告诉前端刷新标题（可选，这里先略过）

    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    # 启动服务器，端口 5000
    print("🚀 服务器已启动: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)