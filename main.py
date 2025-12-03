# main.py

# 从 src 包里导入我们写好的模块
from src.config import load_config
from src.file_loader import get_prompt_list, load_prompt_by_filename
from src.ai_engine import AIEngine

def main():
    # 1. 初始化配置
    config = load_config()
    engine = AIEngine(config["api_key"], config["base_url"], config["model"])

    print("="*50)
    print(f" 🚀 AI 模块化助手 (模型: {config['model']})")
    print("="*50)

    # 2. 获取并选择 Prompt
    prompts = get_prompt_list()
    if not prompts:
        print("⚠️  prompts 文件夹为空！")
        return

    print("\n请选择一位 AI 助手：")
    for i, p in enumerate(prompts):
        print(f" [{i+1}] {p}")

    try:
        choice = int(input("\n👉 请输入序号: ").strip()) - 1
        if not (0 <= choice < len(prompts)):
            print("❌ 序号无效")
            return
        
        # 加载文件
        filename = prompts[choice]
        system_content, greeting = load_prompt_by_filename(filename)
        if not system_content: return

        # 显示开场白
        print(f"\n🤖 {greeting}\n")

    except ValueError:
        print("❌ 输入错误")
        return

    # 3. 用户输入
    user_input = input("🗣️  请输入（无输入直接回车可结束）: ").strip()
    if not user_input: 
        print("程序结束，感谢使用！再见！👋")
        return

    print("\n" + "-"*20 + " 思考中（Ctrl+C可停止进程） " + "-"*20 + "\n")

    # 4. 调用 AI 引擎并流式打印
    try:
        stream = engine.chat_stream(system_content, user_input)
        
        # 负责打印显示的逻辑放在 main 里
        for chunk in stream:
            if chunk.choices[0].delta.content:
                print(chunk.choices[0].delta.content, end="", flush=True)
        
        print("\n\n" + "-"*50)
        
    except Exception as e:
        print(f"❌ 出错: {e}")

if __name__ == "__main__":
    main()