// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original public static methods and preset exclusions.
import { Popup, POPUP_TYPE, POPUP_RESULT } from './popup.js';
import { Handlebars } from '../../../../tavern-runtime/libraries.js';
import templates from '../../../../tavern-runtime/master-preset-templates.json';
export const presetFilteredKeys = [
            'api_server',
            'preset',
            'streaming',
            'truncation_length',
            'n',
            'streaming_url',
            'stopping_strings',
            'can_use_tokenization',
            'can_use_streaming',
            'preset_settings_novel',
            'preset_settings',
            'streaming_novel',
            'nai_preamble',
            'model_novel',
            'streaming_kobold',
            'enabled',
            'bind_to_context',
            'seed',
            'legacy_api',
            'mancer_model',
            'togetherai_model',
            'ollama_model',
            'vllm_model',
            'aphrodite_model',
            'llamacpp_model',
            'server_urls',
            'type',
            'custom_model',
            'bypass_status_check',
            'infermaticai_model',
            'dreamgen_model',
            'openrouter_model',
            'featherless_model',
            'max_tokens_second',
            'openrouter_providers',
            'openrouter_quantizations',
            'openrouter_allow_fallbacks',
            'tabby_model',
            'derived',
            'generic_model',
            'include_reasoning',
            'global_banned_tokens',
            'send_banned_tokens',

            // Reasoning exclusions
            'auto_parse',
            'add_to_prompts',
            'auto_expand',
            'show_hidden',
            'max_additions',
        ];
export function createPresetManagerBase(context, getPresetManager) {
const power_user = new Proxy({}, { get: (_, key) => context.powerUserSettings[key], set: (_, key, value) => (context.powerUserSettings[key] = value, true) });
const saveSettingsDebounced = () => context.saveSettingsDebounced();
const t = value => typeof value === 'string' ? value : value.join('');
const renderTemplateAsync = async (name, values) => Handlebars.compile(templates[name])(values);
return class PresetManager {
static masterSections = {
        'instruct': {
            name: 'Instruct Template',
            getData: () => {
                const manager = getPresetManager('instruct');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            setData: (data) => {
                const manager = getPresetManager('instruct');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            isValid: (data) => PresetManager.isPossiblyInstructData(data),
        },
        'context': {
            name: 'Context Template',
            getData: () => {
                const manager = getPresetManager('context');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            setData: (data) => {
                const manager = getPresetManager('context');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            isValid: (data) => PresetManager.isPossiblyContextData(data),
        },
        'sysprompt': {
            name: 'System Prompt',
            getData: () => {
                const manager = getPresetManager('sysprompt');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            setData: (data) => {
                const manager = getPresetManager('sysprompt');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            isValid: (data) => PresetManager.isPossiblySystemPromptData(data),
        },
        'preset': {
            name: 'Text Completion Preset',
            getData: () => {
                const manager = getPresetManager('textgenerationwebui');
                const name = manager.getSelectedPresetName();
                const data = manager.getPresetSettings(name);
                data.name = name;
                return data;
            },
            setData: (data) => {
                const manager = getPresetManager('textgenerationwebui');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            isValid: (data) => PresetManager.isPossiblyTextCompletionData(data),
        },
        'reasoning': {
            name: 'Reasoning Formatting',
            getData: () => {
                const manager = getPresetManager('reasoning');
                const name = manager.getSelectedPresetName();
                return manager.getPresetSettings(name);
            },
            setData: (data) => {
                const manager = getPresetManager('reasoning');
                const name = data.name;
                return manager.savePreset(name, data);
            },
            isValid: (data) => PresetManager.isPossiblyReasoningData(data),
        },
        'srw': {
            name: 'Start Reply With',
            getData: () => {
                return {
                    value: power_user.user_prompt_bias ?? '',
                    show: power_user.show_user_prompt_bias ?? false,
                };
            },
            setData: (data) => {
                power_user.user_prompt_bias = data.value ?? '';
                power_user.show_user_prompt_bias = data.show ?? false;
                $('#start_reply_with').val(power_user.user_prompt_bias);
                $('#chat-show-reply-prefix-checkbox').prop('checked', power_user.show_user_prompt_bias);
                return saveSettingsDebounced();
            },
            isValid: (data) => PresetManager.isPossiblyStartReplyWithData(data),
        },
    };
static isPossiblyInstructData(data) {
        const instructProps = ['name', 'input_sequence', 'output_sequence'];
        return data && instructProps.every(prop => Object.keys(data).includes(prop));
    }
static isPossiblyContextData(data) {
        const contextProps = ['name', 'story_string'];
        return data && contextProps.every(prop => Object.keys(data).includes(prop));
    }
static isPossiblySystemPromptData(data) {
        const sysPromptProps = ['name', 'content'];
        return data && sysPromptProps.every(prop => Object.keys(data).includes(prop));
    }
static isPossiblyTextCompletionData(data) {
        const textCompletionProps = ['temp', 'top_k', 'top_p', 'rep_pen'];
        return data && textCompletionProps.every(prop => Object.keys(data).includes(prop));
    }
static isPossiblyReasoningData(data) {
        const reasoningProps = ['name', 'prefix', 'suffix', 'separator'];
        return data && reasoningProps.every(prop => Object.keys(data).includes(prop));
    }
static isPossiblyStartReplyWithData(data) {
        return data && 'value' in data && 'show' in data;
    }
static async performMasterImport(data, fileName) {
        if (!data || typeof data !== 'object') {
            toastr.error(t`Invalid data provided for master import`);
            return;
        }

        // Check for legacy file imports
        // 1. Instruct Template
        if (this.isPossiblyInstructData(data)) {
            toastr.info(t`Importing instruct template...`, t`Instruct template detected`);
            return await getPresetManager('instruct').savePreset(data.name, data);
        }

        // 2. Context Template
        if (this.isPossiblyContextData(data)) {
            toastr.info(t`Importing as context template...`, t`Context template detected`);
            return await getPresetManager('context').savePreset(data.name, data);
        }

        // 3. System Prompt
        if (this.isPossiblySystemPromptData(data)) {
            toastr.info(t`Importing as system prompt...`, t`System prompt detected`);
            return await getPresetManager('sysprompt').savePreset(data.name, data);
        }

        // 4. Text Completion settings
        if (this.isPossiblyTextCompletionData(data)) {
            toastr.info(t`Importing as settings preset...`, t`Text Completion settings detected`);
            return await getPresetManager('textgenerationwebui').savePreset(fileName, data);
        }

        // 5. Reasoning Template
        if (this.isPossiblyReasoningData(data)) {
            toastr.info(t`Importing as reasoning template...`, t`Reasoning template detected`);
            return await getPresetManager('reasoning').savePreset(data.name, data);
        }

        const validSections = [];
        for (const [key, section] of Object.entries(this.masterSections)) {
            if (key in data && section.isValid(data[key])) {
                validSections.push(key);
            }
        }

        if (validSections.length === 0) {
            toastr.error(t`No valid sections found in imported data`);
            return;
        }

        const sectionNames = validSections.reduce((acc, key) => {
            acc[key] = { key: key, name: this.masterSections[key].name, preset: data[key]?.name || '' };
            return acc;
        }, {});

        const html = $(await renderTemplateAsync('masterImport', { sections: sectionNames }));
        const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Import`,
            cancelButton: t`Cancel`,
        });

        const result = await popup.show();

        // Import cancelled
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const importedSections = [];
        const confirmedSections = html.find('input:checked').map((_, el) => el instanceof HTMLInputElement && el.value).get();

        if (confirmedSections.length === 0) {
            toastr.info(t`No sections selected for import`);
            return;
        }

        for (const section of confirmedSections) {
            const sectionData = data[section];
            const masterSection = this.masterSections[section];
            if (sectionData && masterSection) {
                await masterSection.setData(sectionData);
                importedSections.push(masterSection.name);
            }
        }

        toastr.success(t`Imported ${importedSections.length} settings: ${importedSections.join(', ')}`);
    }
static async performMasterExport() {
        const sectionNames = Object.entries(this.masterSections).reduce((acc, [key, section]) => {
            acc[key] = { key: key, name: section.name, checked: !['preset', 'srw'].includes(key) };
            return acc;
        }, {});
        const html = $(await renderTemplateAsync('masterExport', { sections: sectionNames }));

        const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Export`,
            cancelButton: t`Cancel`,
        });

        const result = await popup.show();

        // Export cancelled
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        const confirmedSections = html.find('input:checked').map((_, el) => el instanceof HTMLInputElement && el.value).get();
        const data = {};

        if (confirmedSections.length === 0) {
            toastr.info(t`No sections selected for export`);
            return;
        }

        for (const section of confirmedSections) {
            const masterSection = this.masterSections[section];
            if (masterSection) {
                data[section] = masterSection.getData();
            }
        }

        return JSON.stringify(data, null, 4);
    }
};
}
