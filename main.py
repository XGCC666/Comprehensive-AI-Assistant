import os
import sys
from openai import OpenAI
from dotenv import load_dotenv

# 1. 加载配置
load_dotenv()
API_KEY = os.getenv("MY_API_KEY")
BASE_URL = os.getenv("MY_API_URL")
MODEL_NAME = os.getenv("MY_MODEL_NAME")
PROMPT_DIR = "prompts"

# ==================== 升级版：加载函数 ====================
def load_prompt_data(filename):
    """
    读取文件，并解析出【开场白】和【系统提示词】
    返回: (system_prompt, greeting_message)
    """
    path = os.path.join(PROMPT_DIR, filename)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        if not lines:
            return None, None

        greeting = f"✅ 已加载角色: {filename}" # 默认开场白
        content = "".join(lines) # 默认内容是全文

        # 核心逻辑：检查第一行是不是以 ## Greeting: 开头
        first_line = lines[0].strip()
        if first_line.startswith("## Greeting:"):
            # 1. 提取冒号后面的文字作为开场白
            greeting = first_line.replace("## Greeting:", "").strip()
            # 2. 真正给 AI 的 Prompt 里，去掉这一行（从第二行开始拼接）
            content = "".join(lines[1:])
            
        return content, greeting

    except Exception as e:
        print(f"读取文件出错: {e}")
        return None, None
# ========================================================

def get_available_prompts():
    if not os.path.exists(PROMPT_DIR):
        os.makedirs(PROMPT_DIR)
    return [f for f in os.listdir(PROMPT_DIR) if f.endswith('.md')]

def main():
    if not API_KEY or not BASE_URL:
        print("❌ 错误：请检查 .env 配置")
        return

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    print("="*50)
    print(f" 🎭 AI 角色扮演中心 (模型: {MODEL_NAME})")
    print("="*50)

    # 1. 选择角色
    prompts = get_available_prompts()
    if not prompts:
        print(f"⚠️  请在 {PROMPT_DIR} 文件夹里创建 .md 文件")
        return

    print("\n请选择一位 AI 助手：")
    for index, filename in enumerate(prompts):
        print(f" [{index + 1}] {filename}")

    try:
        choice = int(input("\n👉 请输入序号: ").strip()) - 1
        if 0 <= choice < len(prompts):
            selected_file = prompts[choice]
            
            # === 调用新函数，同时拿到 prompt 和 开场白 ===
            system_content, greeting_msg = load_prompt_data(selected_file)
            
            if not system_content: return
            
            # === 打印炫酷的自定义开场白 ===
            print("\n" + "*" * 50)
            print(f"🤖 {greeting_msg}") # 这里会显示你在 md 文件里写的那句话
            print("*" * 50 + "\n")
            
        else:
            print("❌ 序号无效")
            return
    except ValueError:
        print("❌ 输入错误")
        return

    # 2. 用户输入
    user_input = input("🗣️  请对它说 (直接回车退出): ").strip()
    if not user_input: return

    print("\n⏳ 思考中...\n")

    # 3. 发送请求
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_input},
            ],
            temperature=0.7,
        )
        print("-" * 20 + " 回答 " + "-" * 20)
        print(response.choices[0].message.content)
        print("-" * 50)

    except Exception as e:
        print(f"❌ 出错: {e}")

if __name__ == "__main__":
    main()