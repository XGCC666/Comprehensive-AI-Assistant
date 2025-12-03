import os
from dotenv import load_dotenv

def load_config():
    """
    加载配置。如果 .env 不存在或缺少 Key，不会报错退出，而是返回空字符串。
    让 app.py 去判断是否需要用户输入。
    """
    load_dotenv(override=True) # override=True 确保重新加载文件时能读到最新值

    api_key = os.getenv("MY_API_KEY", "")
    base_url = os.getenv("MY_API_URL", "")
    model_name = os.getenv("MY_MODEL_NAME", "gpt-3.5-turbo")
    
    # 返回字典，不再做 sys.exit() 检查
    return {
        "api_key": api_key,
        "base_url": base_url,
        "model": model_name
    }