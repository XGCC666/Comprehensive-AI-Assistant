# 🤖 多角色AI助手 🤖

> [!WARNING]
> **注意**：目前只适用于一次性问答，还没进行上下文记忆适配。

这是一个基于 Python 的轻量级 AI 助手框架。它允许你通过简单的 Markdown 文件定义不同的 AI 角色（如翻译官、代码专家、提示词架构师等），并在运行时动态切换。

支持所有兼容 OpenAI 协议的接口（如 DeepSeek, Moonshot, LocalAI 等）。

## ✨ 功能特点

* **多角色切换**：自动读取 `prompts/` 文件夹下的 `.md` 文件，一键切换不同的人格。
* **自定义开场白**：支持在 Prompt 文件中定义专属的欢迎语。
* **安全可靠**：使用 `.env` 文件管理 API Key，防止密钥泄露。
* **兼容性强**：支持自定义 Base URL 和模型名称。

## 🚀 快速开始

### 1. 环境准备
确保你的电脑上安装了 Python 3.8+。

### 2. 安装依赖
在终端运行以下命令安装所需的库：
```bash
pip install openai python-dotenv
````

### 🔑 配置密钥 (.env)

由于安全原因，本项目不包含配置文件。请在项目根目录下新建一个名为 `.env` 的文件，并填入以下内容：

```env
MY_API_KEY=sk-你的密钥
MY_API_URL=[https://api.deepseek.com](https://api.deepseek.com)  # 或其他接口地址
MY_MODEL_NAME=deepseek-chat          # 你想使用的模型名称
```

### 🖥️ 运行程序

```bash
python main.py
```

## 📂 如何添加新角色？

1.  在 `prompts/` 文件夹下新建一个 `.md` 文件（例如 `xiaohongshu.md`）。
2.  按照以下格式编写：

<!-- end list -->

```markdown
## Greeting: 👋 嗨！我是你的小红书文案专家，快把产品发给我吧！

# Role
你是一个小红书爆款文案写手...

# Context
...
```
或者使用prompt architect生成后复制到`.md` 文件中
程序会自动扫描并加载这个新角色。

## 🛠️ 项目结构

```text
.
├── main.py           # 主程序入口
├── .env              # 配置文件 (需手动创建，勿上传)
├── .gitignore        # Git 忽略规则
└── prompts/          # 存放所有角色 Prompt 的文件夹
    ├── architect.md
    └── ...
```
