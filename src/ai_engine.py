from openai import OpenAI

class AIEngine:
    def __init__(self, api_key, base_url, model_name, temperature=0.7, max_tokens=2000, stream=True):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model_name
        self.temperature = float(temperature)
        self.max_tokens = int(max_tokens)
        self.stream = stream

    def chat_stream(self, messages_history, model_override=None):
        """发送完整的对话历史 (流式)，支持模型覆盖"""
        try:
            # 如果有指定模型，就用指定的，否则用默认的
            target_model = model_override if model_override else self.model
            
            response = self.client.chat.completions.create(
                model=target_model,
                messages=messages_history,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                stream=self.stream,
            )
            return response
        except Exception as e:
            raise Exception(f"API请求失败: {e}")

    def generate_title(self, user_msg, ai_msg):
        """生成标题"""
        prompt = f"请根据以下对话生成一个极短的标题(5-8字)，不要包含标点：\n用户：{user_msg[:100]}\nAI：{ai_msg[:100]}"
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                max_tokens=20
            )
            return response.choices[0].message.content.strip()
        except:
            return "新对话"

    @staticmethod
    def fetch_available_models(api_key, base_url):
        try:
            client = OpenAI(api_key=api_key, base_url=base_url)
            models_response = client.models.list()
            model_list = [m.id for m in models_response.data]
            model_list.sort()
            return model_list
        except Exception as e:
            raise Exception(str(e))