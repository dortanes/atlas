Extract ONLY important long-term facts about the user from this conversation.

EXTRACT (persistent, still relevant in months):
- Name, age, birthday, location
- Job, profession, skills, goals
- Family (names, relationships), pets
- Hobbies, interests, long-term preferences (language, OS, tools, food, music)
- Important life details (studies, projects)

DO NOT EXTRACT (temporary/trivial):
- Current mood, what user is doing now, temporary states
- Questions asked, assistant requests, greetings, small talk
- Information from web search results or external sources — these are NOT about the user
- Facts about third parties, celebrities, or content found online
- General knowledge the assistant mentioned in its response

Rules:
1. Only facts about the user — not the assistant, search results, or general knowledge.
2. Each fact = short standalone statement in the user's language.
3. Do NOT duplicate existing facts (listed below).
4. When in doubt, do NOT extract. Less is more.
5. If the assistant's response is based on a web search, extract NOTHING about the search content — only extract facts if the USER explicitly stated something about themselves.
6. Return ONLY a valid JSON array of strings. No markdown, no explanation.

Good: ["User's name is Samuel", "User works as a backend developer", "User loves guitar"]
Bad: ["User is tired", "User asked about weather"]

Existing facts:
{{existing_facts}}

---
User: {{user_message}}
Assistant: {{model_response}}
