// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original context preset controls.
import {extension_prompt_types,extension_prompt_roles} from '../../../../tavern-runtime/host.js';
export const contextControls = [
    // Power user context scoped settings
    { id: 'context_story_string', property: 'story_string', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_example_separator', property: 'example_separator', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_chat_start', property: 'chat_start', isCheckbox: false, isGlobalSetting: false },
    { id: 'context_use_stop_strings', property: 'use_stop_strings', isCheckbox: true, isGlobalSetting: false, defaultValue: false },
    { id: 'context_names_as_stop_strings', property: 'names_as_stop_strings', isCheckbox: true, isGlobalSetting: false, defaultValue: true },
    { id: 'context_story_string_position', property: 'story_string_position', isCheckbox: false, isGlobalSetting: false, defaultValue: extension_prompt_types.IN_PROMPT, trigger: true },
    { id: 'context_story_string_depth', property: 'story_string_depth', isCheckbox: false, isGlobalSetting: false, defaultValue: 1 },
    { id: 'context_story_string_role', property: 'story_string_role', isCheckbox: false, isGlobalSetting: false, defaultValue: extension_prompt_roles.SYSTEM },

    // Existing power user settings
    { id: 'always-force-name2-checkbox', property: 'always_force_name2', isCheckbox: true, isGlobalSetting: true, defaultValue: true },
    { id: 'trim_sentences_checkbox', property: 'trim_sentences', isCheckbox: true, isGlobalSetting: true, defaultValue: false },
    { id: 'single_line', property: 'single_line', isCheckbox: true, isGlobalSetting: true, defaultValue: false },
];
