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
engine = None

def init_engine():
    """尝试初始化 AI 引擎"""
    global engine
    cfg = load_config()
    if cfg["api_key"] and cfg["base_url"]:
        try:
            # 传入所有新参数
            engine = AIEngine(
                api_key=cfg["api_key"], 
                base_url=cfg["base_url"], 
                model_name=cfg["model"],
                temperature=cfg["temperature"],
                max_tokens=cfg["max_tokens"],
                stream=cfg["stream"]
            )
            print(f"✅ AI 引擎就绪: Temp={cfg['temperature']}, Stream={cfg['stream']}")
            return True
        except Exception as e:
            print(f"❌ 初始化失败: {e}")
            return False
    return False

init_engine()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/check_config')
def check_config():
    is_configured = (engine is not None)
    cfg = load_config()
    return jsonify({
        "configured": is_configured,
        "api_key": cfg["api_key"],
        "base_url": cfg["base_url"],
        "model": cfg["model"],
        "temperature": cfg["temperature"],
        "max_tokens": cfg["max_tokens"],
        "stream": cfg["stream"]
    })

@app.route('/api/save_config', methods=['POST'])
def save_config():
    data = request.json
    api_key = data.get('api_key', '').strip()
    base_url = data.get('base_url', '').strip()
    model = data.get('model', '').strip()
    temperature = str(data.get('temperature', 0.7))
    max_tokens = str(data.get('max_tokens', 2000))
    stream = str(data.get('stream', True))

    if not api_key or not base_url:
        return jsonify({"status": "error", "message": "Key 或 URL 不能为空"}), 400

    env_content = (
        f"MY_API_KEY={api_key}\n"
        f"MY_API_URL={base_url}\n"
        f"MY_MODEL_NAME={model}\n"
        f"MY_TEMPERATURE={temperature}\n"
        f"MY_MAX_TOKENS={max_tokens}\n"
        f"MY_STREAM={stream}\n"
    )
    
    try:
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
    except Exception as e:
        return jsonify({"status": "error", "message": f"写入失败: {e}"}), 500

    if init_engine():
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "保存成功但连接失败"}), 400

@app.route('/api/fetch_models', methods=['POST'])
def fetch_models_api():
    data = request.json
    try:
        models = AIEngine.fetch_available_models(data.get('api_key'), data.get('base_url'))
        return jsonify({"status": "success", "models": models})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ... (保持原有的 prompts, history, new_chat, load_chat, delete_chat, rename_chat 接口不变) ...
# 请务必保留这些接口代码，为了篇幅我折叠了，它们和上一次完全一样

@app.route('/api/prompts')
def get_prompts(): return jsonify(get_prompt_list())

@app.route('/api/history')
def get_history(): return jsonify(history_mgr.list_all_chats())

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
    if not engine:
        err = json.dumps({"text": "❌ 请先在设置中配置 API Key"}, ensure_ascii=False)
        return Response(f"data: {err}\n\n", mimetype='text/event-stream')
        
    user_input = request.args.get('message')
    if not CURRENT_CHAT_DATA: return Response("Error", status=400)
    
    CURRENT_CHAT_DATA["messages"].append({"role": "user", "content": user_input})

    def generate():
        full_response = ""
        try:
            # 这里的 engine 已经包含了 temperature 等参数
            response = engine.chat_stream(CURRENT_CHAT_DATA["messages"])
            
            # 判断是否开启流式
            if engine.stream:
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        json_data = json.dumps({"text": content}, ensure_ascii=False)
                        yield f"data: {json_data}\n\n"
            else:
                # 非流式，一次性返回
                content = response.choices[0].message.content
                full_response = content
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
            err_msg = json.dumps({"text": f"\n❌ 出错: {str(e)}"}, ensure_ascii=False)
            yield f"data: {err_msg}\n\n"

    return Response(generate(), mimetype='text/event-stream')

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == '__main__':
    Timer(1.5, open_browser).start()
    app.run(debug=False, port=5000)