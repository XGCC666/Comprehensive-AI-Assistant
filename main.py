# main.py
import sys
from src.config import load_config
from src.file_loader import get_prompt_list, load_prompt_by_filename
from src.ai_engine import AIEngine
from src.history_manager import HistoryManager # 导入新模块

def main():
    # 1. 初始化
    config = load_config()
    engine = AIEngine(config["api_key"], config["base_url"], config["model"])
    history_mgr = HistoryManager()

    print("="*50)
    print(f" 🧠 AI 记忆助手 (模型: {config['model']})")
    print("="*50)

    # 2. 首页：选择“新对话”还是“历史记录”
    all_chats = history_mgr.list_all_chats()
    
    print("\n[+] 创建新对话 (New Chat)")
    # 列出最近的 5 条历史
    for i, chat in enumerate(all_chats[:5]):
        print(f"[{i+1}] 🕒 {chat['updated_at'][5:-3]} | {chat['title']} ({chat['prompt_file']})")
    
    choice = input("\n👉 请选择 (直接回车=新对话): ").strip()
    
    current_chat_data = None
    chat_id = None

    # === 分支 A：加载历史 ===
    if choice.isdigit() and 1 <= int(choice) <= len(all_chats):
        selected_chat = all_chats[int(choice)-1]
        chat_id = selected_chat["id"]
        current_chat_data = history_mgr.load_chat(chat_id)
        print(f"\n✅ 已恢复对话：{current_chat_data['title']}")
        # 打印最后两句让用户想起来聊到哪了
        if len(current_chat_data["messages"]) > 1:
            last_msg = current_chat_data["messages"][-1]
            print(f"Dataset 上次说到: {last_msg['content'][:50]}...\n")

    # === 分支 B：新对话 ===
    else:
        # 选角色
        prompts = get_prompt_list()
        print("\n--- 请选择 AI 角色 ---")
        for i, p in enumerate(prompts):
            print(f" [{i+1}] {p}")
        
        try:
            p_idx = int(input("👉 序号: ").strip()) - 1
            filename = prompts[p_idx]
            system_content, greeting = load_prompt_by_filename(filename)
            
            # 创建新历史文件
            chat_id, current_chat_data = history_mgr.create_new_chat(
                filename, system_content, greeting
            )
            print(f"\n🤖 {greeting}\n")
        except:
            print("❌ 选择无效")
            return

    # 3. 进入聊天循环 (Context Loop)
    while True:
        try:
            user_input = input("\n🗣️  你 (q退出): ").strip()
            if user_input.lower() in ['q', 'quit', 'exit']:
                print("👋 再见！对话已保存。")
                break
            if not user_input: continue

            # A. 把用户的话加入历史
            current_chat_data["messages"].append({"role": "user", "content": user_input})
            
            print("-" * 20 + " 生成中 " + "-" * 20)
            
            # B. 发送完整历史给 AI
            stream = engine.chat_stream(current_chat_data["messages"])
            
            ai_response_content = ""
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    print(content, end="", flush=True)
                    ai_response_content += content
            
            print("\n" + "-" * 50)

            # C. 把 AI 的话加入历史
            current_chat_data["messages"].append({"role": "assistant", "content": ai_response_content})
            
            # D. 实时保存
            history_mgr.save_chat(chat_id, current_chat_data)

            # E. 彩蛋：如果是新对话的第一轮，自动生成标题
            # 判断条件：目前只有 3 条消息 (System + User + AI) 且标题还是初始值
            if len(current_chat_data["messages"]) == 3 and current_chat_data["title"] == "新对话":
                new_title = engine.generate_title(user_input, ai_response_content)
                history_mgr.update_title(chat_id, new_title)
                current_chat_data["title"] = new_title # 更新内存里的标题
                print(f"✨ [自动命名] 对话标题已更新为: {new_title}")

        except KeyboardInterrupt:
            print("\n\n💾 强制退出，进度已保存。")
            break
        except Exception as e:
            print(f"\n❌ 发生错误: {e}")
            break

if __name__ == "__main__":
    main()