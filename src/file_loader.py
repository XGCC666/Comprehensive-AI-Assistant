import os

PROMPT_DIR = "prompts"

def get_prompt_list():
    """获取所有 .md 文件名"""
    if not os.path.exists(PROMPT_DIR):
        os.makedirs(PROMPT_DIR)
    return [f for f in os.listdir(PROMPT_DIR) if f.endswith('.md')]

def load_prompt_by_filename(filename):
    """读取单个文件并解析"""
    path = os.path.join(PROMPT_DIR, filename)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        if not lines: return None, None
        
        greeting = f"✅ 已加载角色: {filename}"
        content = "".join(lines)
        
        # 解析第一行的 Greeting
        if lines[0].strip().startswith("## Greeting:"):
            greeting = lines[0].replace("## Greeting:", "").strip()
            content = "".join(lines[1:])
            
        return content, greeting
    except Exception as e:
        print(f"❌ 读取文件失败: {e}")
        return None, None