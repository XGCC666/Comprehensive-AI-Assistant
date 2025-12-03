import os
import sys
from dotenv import load_dotenv

# 自动加载
load_dotenv()

def load_config():
    """
    加载并返回配置，如果缺配置直接报错退出
    """
    api_key = os.getenv("MY_API_KEY")
    base_url = os.getenv("MY_API_URL")
    model_name = os.getenv("MY_MODEL_NAME")
    
    if not api_key or not base_url:
        print("❌ 严重错误：未在 .env 文件中找到 API 配置！")
        print("请检查 MY_API_KEY 和 MY_API_URL 是否填写正确。")
        sys.exit(1) # 直接终止程序
        
    return {
        "api_key": api_key,
        "base_url": base_url,
        "model": model_name
    }