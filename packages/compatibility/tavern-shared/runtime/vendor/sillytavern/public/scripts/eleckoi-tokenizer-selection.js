// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original automatic text tokenizer selection.
import { textgen_types } from './eleckoi-connect-map.js';
export const TOKENIZER_WARNING_KEY = 'tokenizationWarningShown';

export const TOKENIZER_SUPPORTED_KEY = 'tokenizationSupported';

export const tokenizers = {
    NONE: 0,
    GPT2: 1,
    OPENAI: 2,
    LLAMA: 3,
    NERD: 4,
    NERD2: 5,
    API_CURRENT: 6,
    MISTRAL: 7,
    YI: 8,
    API_TEXTGENERATIONWEBUI: 9,
    API_KOBOLD: 10,
    CLAUDE: 11,
    LLAMA3: 12,
    GEMMA: 13,
    JAMBA: 14,
    QWEN2: 15,
    COMMAND_R: 16,
    NEMO: 17,
    DEEPSEEK: 18,
    COMMAND_A: 19,
    BEST_MATCH: 99,
};
export function resolveTokenizerType({mainApi = 'openai', textCompletionSettings = {}, novelSettings = {}, textModels = [], dreamGenModels = [], textModel = '', onlineStatus = 'no_connection', tokenizerWarning = false, tokenizerSupported = false, koboldCanTokenize = false}) {
const main_api = mainApi, textgen_settings = textCompletionSettings, nai_settings = novelSettings, openRouterModels = textModels;
const online_status = onlineStatus, kai_flags = {can_use_tokenization:koboldCanTokenize};
const getTextGenModel = () => textModel;
const sessionStorage = {getItem:key => key === TOKENIZER_WARNING_KEY ? tokenizerWarning : key === TOKENIZER_SUPPORTED_KEY ? tokenizerSupported : null};
const TEXTGEN_TOKENIZERS = [textgen_types.OOBA,textgen_types.TABBY,textgen_types.KOBOLDCPP,textgen_types.LLAMACPP,textgen_types.VLLM,textgen_types.APHRODITE];
function getCurrentOpenRouterModelTokenizer() {
    const modelId = textgen_settings.openrouter_model;
    const model = openRouterModels.find(x => x.id === modelId);
    if (modelId?.includes('jamba')) {
        return tokenizers.JAMBA;
    }
    switch (model?.architecture?.tokenizer) {
        case 'Llama2':
            return tokenizers.LLAMA;
        case 'Llama3':
            return tokenizers.LLAMA3;
        case 'Yi':
            return tokenizers.YI;
        case 'Mistral':
            return tokenizers.MISTRAL;
        case 'Gemini':
            return tokenizers.GEMMA;
        case 'Claude':
            return tokenizers.CLAUDE;
        case 'Cohere':
            return tokenizers.COMMAND_R;
        case 'Qwen':
            return tokenizers.QWEN2;
        default:
            return tokenizers.OPENAI;
    }
}

function getCurrentDreamGenModelTokenizer() {
    const modelId = textgen_settings.dreamgen_model;
    const model = dreamGenModels.find(x => x.id === modelId);
    if (model.id.startsWith('lucid-v1-medium') || model.id.startsWith('lucid-v1-base')) {
        return tokenizers.MISTRAL;
    } else if (model.id.startsWith('lucid-v1-extra-large') || model.id.startsWith('lucid-v1-max')) {
        return tokenizers.LLAMA3;
    } else {
        return tokenizers.MISTRAL;
    }
}
function getTokenizerBestMatch(forApi) {
    if (!forApi) {
        forApi = main_api;
    }

    if (forApi === 'novel') {
        if (nai_settings.model_novel.includes('clio')) {
            return tokenizers.NERD;
        }
        if (nai_settings.model_novel.includes('kayra')) {
            return tokenizers.NERD2;
        }
        if (nai_settings.model_novel.includes('erato')) {
            return tokenizers.LLAMA3;
        }
    }
    if (forApi === 'kobold' || forApi === 'textgenerationwebui' || forApi === 'koboldhorde') {
        // Try to use the API tokenizer if possible:
        // - API must be connected
        // - Kobold must pass a version check
        // - Tokenizer haven't reported an error previously
        const hasTokenizerError = sessionStorage.getItem(TOKENIZER_WARNING_KEY);
        const hasValidEndpoint = sessionStorage.getItem(TOKENIZER_SUPPORTED_KEY);
        const isConnected = online_status !== 'no_connection';
        const isTokenizerSupported = TEXTGEN_TOKENIZERS.includes(textgen_settings.type) && (textgen_settings.type !== textgen_types.OOBA || hasValidEndpoint);

        if (!hasTokenizerError && isConnected) {
            if (forApi === 'kobold' && kai_flags.can_use_tokenization) {
                return tokenizers.API_KOBOLD;
            }

            if (forApi === 'textgenerationwebui' && isTokenizerSupported) {
                return tokenizers.API_TEXTGENERATIONWEBUI;
            }
            if (forApi === 'textgenerationwebui' && textgen_settings.type === textgen_types.OPENROUTER) {
                return getCurrentOpenRouterModelTokenizer();
            }
            if (forApi === 'textgenerationwebui' && textgen_settings.type === textgen_types.DREAMGEN) {
                return getCurrentDreamGenModelTokenizer();
            }
        }

        if (forApi === 'textgenerationwebui') {
            const model = String(getTextGenModel() || online_status).toLowerCase();
            if (model.includes('llama3') || model.includes('llama-3')) {
                return tokenizers.LLAMA3;
            }
            if (model.includes('mistral') || model.includes('mixtral')) {
                return tokenizers.MISTRAL;
            }
            if (model.includes('gemma')) {
                return tokenizers.GEMMA;
            }
            if (model.includes('nemo') || model.includes('pixtral')) {
                return tokenizers.NEMO;
            }
            if (model.includes('deepseek')) {
                return tokenizers.DEEPSEEK;
            }
            if (model.includes('yi')) {
                return tokenizers.YI;
            }
            if (model.includes('jamba')) {
                return tokenizers.JAMBA;
            }
            if (model.includes('command-r')) {
                return tokenizers.COMMAND_R;
            }
            if (model.includes('command-a')) {
                return tokenizers.COMMAND_A;
            }
            if (model.includes('qwen2')) {
                return tokenizers.QWEN2;
            }
        }

        return tokenizers.LLAMA;
    }

    return tokenizers.NONE;
}
return getTokenizerBestMatch();
}
