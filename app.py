import os
import sys
import webbrowser
from threading import Timer
from flask import Flask, render_template, request, Response, jsonify
from src.config import load_config
from src.file_loader import get_prompt_list, load_prompt_by_filename
from src.ai_engine import AIEngine
from src.history_manager import HistoryManager
import json

# 资源路径修正（适配 PyInstaller 打包）
def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

app = Flask(__name__, 
            template_folder=resource_path('templates'), 
            static_folder=resource_path('static'))

history_mgr = HistoryManager()
CURRENT_CHAT_ID = None
CURRENT_CHAT_DATA = None

# 全局变量：AI 引擎
engine = None

def init_engine():
    """尝试初始化 AI 引擎"""
    global engine
    cfg = load_config()
    if cfg["api_key"] and cfg["base_url"]:
        try:
            engine = AIEngine(cfg["api_key"], cfg["base_url"], cfg["model"])
            print("✅ AI 引擎初始化成功")
            return True
        except Exception as e:
            print(f"❌ 初始化失败: {e}")
            return False
    return False

# 启动时先尝试初始化一次
init_engine()

# ================= 路由 =================

@app.route('/')
def home():
    return render_template('index.html')

# 1. 检查配置接口
@app.route('/api/check_config')
def check_config():
    """告诉前端当前是否已经配置好了"""
    global engine
    is_configured = (engine is not None)
    # 同时返回当前的配置信息（方便显示在输入框里）
    cfg = load_config()
    return jsonify({
        "configured": is_configured,
        "api_key": cfg["api_key"],
        "base_url": cfg["base_url"],
        "model": cfg["model"]
    })

# 2. 保存配置接口
@app.route('/api/save_config', methods=['POST'])
def save_config():
    """接收前端传来的 Key，写入 .env，并重启引擎"""
    data = request.json
    api_key = data.get('api_key', '').strip()
    base_url = data.get('base_url', '').strip()
    model = data.get('model', '').strip()

    if not api_key or not base_url:
        return jsonify({"status": "error", "message": "Key 或 URL 不能为空"}), 400

    # 写入本地 .env 文件
    env_content = f"MY_API_KEY={api_key}\nMY_API_URL={base_url}\nMY_MODEL_NAME={model}\n"
    try:
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
    except Exception as e:
        return jsonify({"status": "error", "message": f"写入文件失败: {e}"}), 500

    # 重新加载引擎
    if init_engine():
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "配置保存了，但连接 AI 失败，请检查 Key 是否正确"}), 400

# ... (以下原有的 prompts, history, new_chat 等接口保持不变，请复制之前的代码) ...

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
    return jsonify({"status": "error"}), 404

@app.route('/api/rename_chat', methods=['POST'])
def rename_chat():
    data = request.json
    history_mgr.update_title(data.get('chat_id'), data.get('new_title'))
    global CURRENT_CHAT_DATA
    if CURRENT_CHAT_ID == data.get('chat_id') and CURRENT_CHAT_DATA:
        CURRENT_CHAT_DATA["title"] = data.get('new_title')
    return jsonify({"status": "success"})

@app.route('/api/chat_stream')
def chat_stream():
    global CURRENT_CHAT_DATA
    if not engine: # 关键检查：如果没有配置 Key，直接报错
        return Response("data: " + json.dumps({"text": "❌ 请先在设置中配置 API Key！"}, ensure_ascii=False) + "\n\n", mimetype='text/event-stream')
        
    user_input = request.args.get('message')
    if not CURRENT_CHAT_DATA: return Response("Error", status=400)
    
    CURRENT_CHAT_DATA["messages"].append({"role": "user", "content": user_input})

    def generate():
        full_response = ""
        try:
            stream = engine.chat_stream(CURRENT_CHAT_DATA["messages"])
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    json_data = json.dumps({"text": content}, ensure_ascii=False)
                    yield f"data: {json_data}\n\n"
            
            CURRENT_CHAT_DATA["messages"].append({"role": "assistant", "content": full_response})
            history_mgr.save_chat(CURRENT_CHAT_ID, CURRENT_CHAT_DATA)
            
            if len(CURRENT_CHAT_DATA["messages"]) == 3:
                 try:
                    new_title = engine.generate_title(user_input, full_response)
                    history_mgr.update_title(CURRENT_CHAT_ID, new_title)
                 except: pass
        except Exception as e:
            err_msg = json.dumps({"text": f"\n❌ API 调用失败: {str(e)}"}, ensure_ascii=False)
            yield f"data: {err_msg}\n\n"

    return Response(generate(), mimetype='text/event-stream')

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == '__main__':
    Timer(1.5, open_browser).start()
    app.run(debug=False, port=5000)