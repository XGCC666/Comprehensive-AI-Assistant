from openai import OpenAI

class AIEngine:
    def __init__(self, api_key, base_url, model_name):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model_name

    def chat_stream(self, messages_history):
        """
        发送完整的对话历史
        messages_history: list of {"role": "...", "content": "..."}
        """
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages_history, # 这里直接传列表
                temperature=0.7,
                stream=True,
            )
            return stream
        except Exception as e:
            raise Exception(f"API请求失败: {e}")

    def generate_title(self, user_msg, ai_msg):
        """
        根据第一轮对话，自动生成一个简短的标题
        """
        prompt = f"""
        请根据以下对话内容，生成一个极简短的标题（不超过10个字）。
        不要包含“标题”二字，直接输出内容。
        
        用户：{user_msg[:200]}
        AI：{ai_msg[:200]}
        """
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