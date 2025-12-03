import os
from dotenv import load_dotenv

def load_config():
    load_dotenv(override=True)

    api_key = os.getenv("MY_API_KEY", "")
    base_url = os.getenv("MY_API_URL", "")
    model_name = os.getenv("MY_MODEL_NAME", "gpt-3.5-turbo")
    
    # 新增参数，带默认值
    temperature = os.getenv("MY_TEMPERATURE", "0.7")
    max_tokens = os.getenv("MY_MAX_TOKENS", "2000")
    stream = os.getenv("MY_STREAM", "True")

    return {
        "api_key": api_key,
        "base_url": base_url,
        "model": model_name,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": stream.lower() == 'true'
    }