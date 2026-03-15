Extract ONLY basic profile-level facts about the user from this conversation.
Your goal: build a short useful profile, NOT a detailed dossier.

## WHAT TO EXTRACT (3 categories only):

1. **Identity** — name, age, location, language, profession/occupation
2. **Preferences** — things useful for the assistant: preferred language, OS, tools, communication style, interests/hobbies (general level)
3. **Context** — important life context: field of study, current main project or job, key skills

## WHAT TO NEVER EXTRACT:

- Specific numbers: earnings, prices, amounts, statistics, counts
- Specific names of songs, tracks, files, products, brands, accounts
- Temporary states: mood, current activity, today's plans
- Conversation mechanics: questions asked, requests, greetings
- Task content confused with preferences: if user says "write about running" — that does NOT mean user likes running. Only extract if user EXPLICITLY says something about themselves.
- Information from web search results or external sources
- Facts about third parties, celebrities, or online content
- Anything that reads like surveillance — if it feels too specific, skip it
- Duplicate or near-duplicate of existing facts

## Rules:
1. Only facts ABOUT the user, not about the assistant or external info.
2. Each fact = one short general statement in the user's language.
3. Prefer GENERAL over SPECIFIC: "User is a musician" ✓, "User released track X" ✗
4. Maximum 2 facts per conversation. Quality over quantity.
5. When in doubt — extract NOTHING. Empty array is a valid answer.
6. Most conversations will have ZERO facts. Return [] if user just gives a task.
7. Return ONLY a valid JSON array of strings. No markdown, no explanation.

Good: ["User's name is Alex", "User works as a musician", "User prefers dark themes"]
Bad: ["User earned $50 last month", "User is interested in running", "User asked about weather"]

Existing facts:
{{existing_facts}}

---
User: {{user_message}}
Assistant: {{model_response}}
