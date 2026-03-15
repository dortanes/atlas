/**
 * ChatMode — handles conversational (non-action) commands.
 *
 * When the intent classifier determines a user command doesn't
 * need screen interaction, this module streams a response
 * directly from the LLM with optional thinking display.
 *
 * Flow:
 * 1. Build conversation with system prompt
 * 2. Stream response with thoughts (if model supports it)
 * 3. Emit chunks to ResponseIsland for live display
 * 4. Trigger TTS and async fact extraction
 *
 * Uses native `systemInstruction` (Gemini) / system role (OpenAI)
 * instead of fake user/model message pairs — saves ~300 tokens per call.
 */

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import type { VisionService } from '@electron/services/vision/VisionService'
import { mainEventBus } from '@electron/utils/eventBus'
import { getConfig } from '@electron/utils/config'
import { formatLLMError } from '@electron/utils/llmErrors'
import { createLogger } from '@electron/utils/logger'
import { sleep } from '@electron/utils/other'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { FactExtractor } from './FactExtractor'
import { buildDynamicContext } from './agentUtils'
import type { SessionLogger } from '@electron/utils/sessionLogger'

const log = createLogger('ChatMode')

/**
 * Run chat-only mode: stream a response with optional thinking.
 *
 * @param command — the user's text command
 * @param history — prior conversation messages
 * @param intelligence — LLM service for streaming
 * @param promptLoader — for loading system prompt template
 * @param persona — active agent persona
 * @param visionService — optional, used only for resolution string
 * @param factExtractor — optional, for async fact extraction
 * @returns Updated conversation history including this exchange
 */
export async function runChatOnly(
  command: string,
  history: LLMMessage[],
  intelligence: IntelligenceService,
  promptLoader: PromptLoader,
  persona: AgentProfile,
  visionService?: VisionService | null,
  factExtractor?: FactExtractor,
  sessionLogger?: SessionLogger,
): Promise<LLMMessage[]> {
  const userFacts = factExtractor
    ? factExtractor.getFactsText(persona.id)
    : 'No known facts about the user yet.'

  // ── Build stable system prompt (no time/facts — for caching) ──
  const systemPrompt = promptLoader.load('system', {
    os: `${os.platform()} ${os.release()}`,
    resolution: visionService?.getResolutionString() ?? '1920x1080',
    persona_name: persona.name,
    personality: persona.personality,
  }, persona.id)

  // Dynamic context — changes every call, NOT cached
  const dynamicContext = buildDynamicContext(userFacts)

  // Conversation messages — prepend dynamic context to user message
  const messages: LLMMessage[] = [
    ...history,
    { role: 'user', text: `${dynamicContext}\n\n${command}` },
  ]

  // Stream IDs for response and thoughts
  const thoughtsId = `thoughts-${randomUUID()}`
  const responseId = randomUUID()
  const { thoughtsTransitionDelay } = getConfig().agent

  let fullResponse = ''
  let hadThoughts = false
  let hasStartedResponse = false

  try {
    // Try to use cached context for token savings
    const cachedContent = await intelligence.getCache(systemPrompt, persona.id, undefined, 'chat').catch(() => null)

    // Pass system prompt via native systemInstruction — saves ~300 tokens
    const stopStream = sessionLogger?.startTimer('LLM streaming')
    const stream = intelligence.streamWithThoughts(messages, systemPrompt, cachedContent ?? undefined)

    for await (const chunk of stream) {
      if (chunk.type === 'thought') {
        // Emit thinking chunk → ThoughtsIsland
        hadThoughts = true
        mainEventBus.emit('agent:response', {
          id: thoughtsId,
          kind: 'thoughts' as const,
          text: chunk.content,
          streaming: true,
          done: false,
        })
      } else {
        // Transition from thoughts → response
        if (hadThoughts && !hasStartedResponse) {
          mainEventBus.emit('agent:response', {
            id: thoughtsId,
            kind: 'thoughts' as const,
            text: '',
            streaming: false,
            done: true,
          })
          await sleep(thoughtsTransitionDelay)
        }

        // Emit response chunk → ResponseIsland
        hasStartedResponse = true
        fullResponse += chunk.content

        mainEventBus.emit('agent:response', {
          id: responseId,
          kind: 'response' as const,
          text: chunk.content,
          streaming: true,
          done: false,
        })
      }
    }

    // Finalize thoughts stream if no response followed
    if (hadThoughts && !hasStartedResponse) {
      mainEventBus.emit('agent:response', {
        id: thoughtsId,
        kind: 'thoughts' as const,
        text: '',
        streaming: false,
        done: true,
      })
    }

    // Finalize response stream
    if (hasStartedResponse) {
      mainEventBus.emit('agent:response', {
        id: responseId,
        kind: 'response' as const,
        text: '',
        streaming: false,
        done: true,
      })
    }

    log.info(`Response complete (${fullResponse.length} chars, thoughts: ${hadThoughts}, persona: ${persona.name})`)
    stopStream?.()
    sessionLogger?.step(`Response length: ${fullResponse.length} chars`)
    sessionLogger?.step(`Had thoughts: ${hadThoughts}`)

    // Trigger TTS for the response
    if (fullResponse.trim()) {
      mainEventBus.emit('tts:speak', { text: fullResponse })
    }

    // Async fact extraction (fire-and-forget)
    if (factExtractor && fullResponse.trim()) {
      factExtractor.extract(persona.id, command, fullResponse).catch((err) => {
        log.error('Fact extraction failed:', err)
      })
    }
  } catch (err) {
    // Show error in ResponseIsland
    const message = formatLLMError(err)
    log.error('LLM stream error:', err)
    const errId = randomUUID()
    mainEventBus.emit('agent:response', {
      id: errId,
      kind: 'response' as const,
      text: `⚠️ ${message}`,
      streaming: true,
      done: false,
    })
    mainEventBus.emit('agent:response', {
      id: errId,
      kind: 'response' as const,
      text: '',
      streaming: false,
      done: true,
    })
  }

  return [
    ...history,
    { role: 'user', text: command },
    { role: 'model', text: fullResponse },
  ]
}
