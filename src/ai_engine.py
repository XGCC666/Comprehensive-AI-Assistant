from openai import OpenAI

class AIEngine:
    def __init__(self, api_key, base_url, model_name):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model_name

    def chat_stream(self, system_prompt, user_input):
        """
        发起流式对话
        """
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_input},
                ],
                temperature=0.7,
                stream=True, # 开启流式
            )
            return stream
        except Exception as e:
            raise Exception(f"API请求失败: {e}")