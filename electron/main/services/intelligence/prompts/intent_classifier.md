Classify this user message into one of three categories:

1. **direct** — simple OS action via shell (PowerShell) or hotkey WITHOUT looking at the screen. Examples: open/close apps ("open Chrome"), window management ("minimize this"), volume ("mute"), system info, create/delete files, **web search / information lookup** ("search for X", "find out about X", "what's the weather", "who is Elon Musk"), or **file search** ("find my resume", "where is that PDF").
2. **action** — requires LOOKING at the screen (screenshot) to interact with GUI. Examples: "Click the blue button", "Read the text on screen", "Scroll down", "What's open on my screen".
3. **chat** — casual small talk, greetings, or simple questions that do NOT need fresh/current data and can be answered from general knowledge alone. Examples: "Hello", "How are you?", "What is 2+2?", "Translate this word".

**Priority rule**: If a question COULD benefit from up-to-date or factual web data (people, events, relationships, news, prices, weather) → classify as **direct**, NOT chat. When in doubt between chat and direct → choose **direct**.

Consider context — if previous messages involved screen actions, follow-up questions likely need action too.{{context}}
Current message: "{{command}}"
