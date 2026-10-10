// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0.
import { chat_completion_sources } from '../../../../tavern-runtime/host.js';
export const textgen_types = {
    OOBA: 'ooba',
    MANCER: 'mancer',
    VLLM: 'vllm',
    APHRODITE: 'aphrodite',
    TABBY: 'tabby',
    KOBOLDCPP: 'koboldcpp',
    TOGETHERAI: 'togetherai',
    LLAMACPP: 'llamacpp',
    OLLAMA: 'ollama',
    INFERMATICAI: 'infermaticai',
    DREAMGEN: 'dreamgen',
    OPENROUTER: 'openrouter',
    FEATHERLESS: 'featherless',
    HUGGINGFACE: 'huggingface',
    GENERIC: 'generic',
};
export const CONNECT_API_MAP = {};
const UNIQUE_APIS = [];
function setupConnectAPIMap() {
    /** @type {Record<string, ConnectAPIMap>} */
    const result = {
        // Default APIs not contained inside text gen / chat gen
        'kobold': {
            selected: 'kobold',
            button: '#api_button',
        },
        'horde': {
            selected: 'koboldhorde',
        },
        'novel': {
            selected: 'novel',
            button: '#api_button_novel',
        },
        'koboldcpp': {
            selected: 'textgenerationwebui',
            button: '#api_button_textgenerationwebui',
            type: textgen_types.KOBOLDCPP,
        },
        // KoboldCpp alias
        'kcpp': {
            selected: 'textgenerationwebui',
            button: '#api_button_textgenerationwebui',
            type: textgen_types.KOBOLDCPP,
        },
        'openai': {
            selected: 'openai',
            button: '#api_button_openai',
            source: chat_completion_sources.OPENAI,
        },
        // OpenAI alias
        'oai': {
            selected: 'openai',
            button: '#api_button_openai',
            source: chat_completion_sources.OPENAI,
        },
        // Google alias
        'google': {
            selected: 'openai',
            button: '#api_button_openai',
            source: chat_completion_sources.MAKERSUITE,
        },
        // OpenRouter special naming, to differentiate between chat comp and text comp
        'openrouter': {
            selected: 'openai',
            button: '#api_button_openai',
            source: chat_completion_sources.OPENROUTER,
        },
        'openrouter-text': {
            selected: 'textgenerationwebui',
            button: '#api_button_textgenerationwebui',
            type: textgen_types.OPENROUTER,
        },
    };

    // Fill connections map from textgen_types and chat_completion_sources
    for (const textGenType of Object.values(textgen_types)) {
        if (result[textGenType]) continue;
        result[textGenType] = {
            selected: 'textgenerationwebui',
            button: '#api_button_textgenerationwebui',
            type: textGenType,
        };
    }

    for (const chatCompletionSource of Object.values(chat_completion_sources)) {
        if (result[chatCompletionSource]) continue;
        result[chatCompletionSource] = {
            selected: 'openai',
            button: '#api_button_openai',
            source: chatCompletionSource,
        };
    }

    Object.assign(CONNECT_API_MAP, result);
    UNIQUE_APIS.push(...new Set(Object.values(CONNECT_API_MAP).map(x => x.selected)));
}
setupConnectAPIMap();
