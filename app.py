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
    global engine
    cfg = load_config()
    if cfg["api_key"] and cfg["base_url"]:
        try:
            engine = AIEngine(
                api_key=cfg["api_key"], 
                base_url=cfg["base_url"], 
                model_name=cfg["model"],
                temperature=cfg["temperature"],
                max_tokens=cfg["max_tokens"],
                stream=cfg["stream"]
            )
            print("✅ AI 引擎初始化成功")
            return True
        except Exception as e:
            print(f"❌ 初始化失败: {e}")
            return False
    return False

init_engine()

# 默认主题定义
DEFAULT_THEME_IDS = ["dark", "light", "ocean", "forest", "coffee", "cyber"]
THEME_FILE = "themes.json"

if not os.path.exists(THEME_FILE):
    # 如果没有 themes.json，app.py 启动时不会自动创建，依靠前端 fetchThemes 失败时的兜底
    # 或者你可以手动在这里加一段写入默认主题的代码
    pass 

# ================= 路由接口 =================

@app.route('/')
def home():
    return render_template('index.html')

# --- 助手管理接口 (新增) ---
@app.route('/api/prompts/create', methods=['POST'])
def create_prompt():
    data = request.json
    name = data.get('name', '').strip()
    content = data.get('content', '')
    greeting = data.get('greeting', '')
    
    if not name: return jsonify({"status": "error", "message": "文件名不能为空"}), 400
    
    filename = f"{name}.md"
    filepath = os.path.join("prompts", filename)
    
    if os.path.exists(filepath):
        return jsonify({"status": "error", "message": "同名助手已存在"}), 400
        
    full_content = f"## Greeting: {greeting}\n\n{content}"
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(full_content)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 主题管理接口 ---
@app.route('/api/themes', methods=['GET'])
def get_themes():
    try:
        with open(THEME_FILE, 'r', encoding='utf-8') as f: themes = json.load(f)
        return jsonify(themes)
    except: return jsonify([])

@app.route('/api/themes/import', methods=['POST'])
def import_theme():
    new_theme = request.json
    if not new_theme.get('id') or not new_theme.get('colors'):
        return jsonify({"status": "error", "message": "无效格式"}), 400
    try:
        if os.path.exists(THEME_FILE):
            with open(THEME_FILE, 'r', encoding='utf-8') as f: themes = json.load(f)
        else: themes = []
        
        idx = next((i for i, t in enumerate(themes) if t['id'] == new_theme['id']), -1)
        if idx >= 0: themes[idx] = new_theme
        else: themes.append(new_theme)
        
        with open(THEME_FILE, 'w', encoding='utf-8') as f: json.dump(themes, f, indent=2, ensure_ascii=False)
        return jsonify({"status": "success"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/themes/delete', methods=['POST'])
def delete_theme():
    theme_id = request.json.get('id')
    if theme_id in DEFAULT_THEME_IDS:
        return jsonify({"status": "error", "message": "默认主题不可删除"}), 400
    
    try:
        with open(THEME_FILE, 'r', encoding='utf-8') as f: themes = json.load(f)
        themes = [t for t in themes if t['id'] != theme_id]
        with open(THEME_FILE, 'w', encoding='utf-8') as f: json.dump(themes, f, indent=2, ensure_ascii=False)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- 聊天控制接口 ---
@app.route('/api/chat/update_settings', methods=['POST'])
def update_chat_settings():
    global CURRENT_CHAT_DATA
    if not CURRENT_CHAT_DATA: return jsonify({"error": "No chat"}), 400
    
    data = request.json
    new_model = data.get('model')
    new_prompt_file = data.get('prompt_file')
    
    if new_model:
        CURRENT_CHAT_DATA['model'] = new_model
    
    if new_prompt_file:
        sys_content, _ = load_prompt_by_filename(new_prompt_file)
        if sys_content:
            # 替换 system prompt
            if len(CURRENT_CHAT_DATA['messages']) > 0 and CURRENT_CHAT_DATA['messages'][0]['role'] == 'system':
                CURRENT_CHAT_DATA['messages'][0]['content'] = sys_content
            else:
                CURRENT_CHAT_DATA['messages'].insert(0, {"role": "system", "content": sys_content})
            
            CURRENT_CHAT_DATA['prompt_file'] = new_prompt_file

    history_mgr.save_chat(CURRENT_CHAT_ID, CURRENT_CHAT_DATA)
    return jsonify({"status": "success", "data": CURRENT_CHAT_DATA})

# --- 常规接口 ---
@app.route('/api/check_config')
def check_config():
    is_configured = (engine is not None)
    cfg = load_config()
    return jsonify({
        "configured": is_configured,
        "api_key": cfg["api_key"], "base_url": cfg["base_url"], "model": cfg["model"],
        "temperature": cfg["temperature"], "max_tokens": cfg["max_tokens"], "stream": cfg["stream"]
    })

@app.route('/api/save_config', methods=['POST'])
def save_config():
    data = request.json
    api_key = data.get('api_key', '').strip()
    base_url = data.get('base_url', '').strip()
    
    # 构造 .env 内容
    env_content = (
        f"MY_API_KEY={api_key}\nMY_API_URL={base_url}\nMY_MODEL_NAME={data.get('model', '')}\n"
        f"MY_TEMPERATURE={data.get('temperature', 0.7)}\nMY_MAX_TOKENS={data.get('max_tokens', 2000)}\n"
        f"MY_STREAM={data.get('stream', True)}\n"
    )
    try:
        with open('.env', 'w', encoding='utf-8') as f: f.write(env_content)
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500
    if init_engine(): return jsonify({"status": "success"})
    else: return jsonify({"status": "error", "message": "连接失败"}), 400

@app.route('/api/fetch_models', methods=['POST'])
def fetch_models_api():
    data = request.json
    try:
        models = AIEngine.fetch_available_models(data.get('api_key'), data.get('base_url'))
        return jsonify({"status": "success", "models": models})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

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
    
    cfg = load_config()
    chat_data['model'] = cfg['model']
    
    CURRENT_CHAT_ID = chat_id
    CURRENT_CHAT_DATA = chat_data
    return jsonify({"greeting": greeting, "chat_id": chat_id, "messages": chat_data['messages'], "model": chat_data['model']})

@app.route('/api/load_chat', methods=['POST'])
def load_chat():
    global CURRENT_CHAT_ID, CURRENT_CHAT_DATA
    data = request.json
    loaded_data = history_mgr.load_chat(data.get('chat_id'))
    if loaded_data:
        CURRENT_CHAT_ID = data.get('chat_id')
        CURRENT_CHAT_DATA = loaded_data
        return jsonify(loaded_data)
    return jsonify({"error": "Not found"}), 404

@app.route('/api/delete_chat', methods=['POST'])
def delete_chat():
    if history_mgr.delete_chat(request.json.get('chat_id')):
        global CURRENT_CHAT_ID
        if CURRENT_CHAT_ID == request.json.get('chat_id'): CURRENT_CHAT_ID = None
        return jsonify({"status": "success"})
    return jsonify({"status": "error"}), 404

@app.route('/api/rename_chat', methods=['POST'])
def rename_chat():
    data = request.json
    history_mgr.update_title(data.get('chat_id'), data.get('new_title'))
    return jsonify({"status": "success"})

@app.route('/api/chat_stream')
def chat_stream():
    global CURRENT_CHAT_DATA
    if not engine: return Response(f"data: {json.dumps({'text': '❌ 请配置 Key'}, ensure_ascii=False)}\n\n", mimetype='text/event-stream')
    if not CURRENT_CHAT_DATA: return Response("Error", status=400)
    
    user_input = request.args.get('message')
    CURRENT_CHAT_DATA["messages"].append({"role": "user", "content": user_input})

    chat_model = CURRENT_CHAT_DATA.get('model')

    def generate():
        full_response = ""
        try:
            response = engine.chat_stream(CURRENT_CHAT_DATA["messages"], model_override=chat_model)
            if engine.stream:
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        yield f"data: {json.dumps({'text': content}, ensure_ascii=False)}\n\n"
            else:
                content = response.choices[0].message.content or ""
                full_response = content
                yield f"data: {json.dumps({'text': content}, ensure_ascii=False)}\n\n"

            CURRENT_CHAT_DATA["messages"].append({"role": "assistant", "content": full_response})
            history_mgr.save_chat(CURRENT_CHAT_ID, CURRENT_CHAT_DATA)
            
            if len(CURRENT_CHAT_DATA["messages"]) == 3:
                 try:
                    new_title = engine.generate_title(user_input, full_response)
                    history_mgr.update_title(CURRENT_CHAT_ID, new_title)
                 except: pass
        except Exception as e:
            yield f"data: {json.dumps({'text': f'❌ Error: {str(e)}'}, ensure_ascii=False)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

def open_browser(): webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == '__main__':
    Timer(1.5, open_browser).start()
    app.run(debug=False, port=5000)