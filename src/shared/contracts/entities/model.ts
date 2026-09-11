export type ModelApiFormat = 'chat_completions' | 'responses' | 'anthropic_messages' | 'google_gemini'
export type ModelReasoningEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ModelProviderId = 'custom' | 'deepseek' | 'zhipu' | 'zai' | 'moonshot' | 'openai_image' | 'novelai_image'

export interface ModelOption {
  id: string
  name: string
  isUserAdded?: boolean | undefined
  contextWindowTokens?: number | null | undefined
  autoCompactTokenLimit?: number | null | undefined
  maxOutputTokens?: number | null | undefined
  temperature?: number | null | undefined
  topP?: number | null | undefined
  reasoningEffort?: ModelReasoningEffort | null | undefined
  supportsImageInput?: boolean | undefined
}

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProviderId
  api_key: string
  base_url: string
  proxy_url: string
  model: string
  model_options: ModelOption[]
  custom_headers: Record<string, string>
  supports_tools: boolean | null
  enabled: boolean
  image_settings: Record<string, unknown>
  api_format: ModelApiFormat
}

export interface RuntimeModelSettings {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  apiFormat: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai'
  customHeaders: Record<string, string>
  contextWindow: number
  autoCompactTokenLimit?: number | undefined
  maxTokens?: number | undefined
  temperature?: number | undefined
  topP?: number | undefined
  reasoningEffort?: string | undefined
  supportsImageInput: boolean
  proxyUrl?: string | undefined
}
