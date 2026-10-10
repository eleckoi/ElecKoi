// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0; native request transport adapter.
import { formatInstructModeChat, formatInstructModePrompt, getInstructStoppingSequences } from './eleckoi-instruct.js';
import { settingsToUpdate } from './eleckoi-service-responses.js';
import { t, oai_settings } from '../../../../tavern-runtime/host.js';
export function createRequestServices(context, bridge) {
const SillyTavern = { getContext: () => context };
const getPresetManager = type => bridge.presetManager(type);
const getTextGenServer = type => bridge.textServer(type);
const textgenerationwebui_settings = bridge.textSettings;
const setting_names = bridge.textSettingNames;
const createTextGenGenerationData = (...args) => bridge.textPayload(...args);
const createGenerationParameters = (...args) => bridge.chatPayload(...args);
const CONNECT_API_MAP = context.CONNECT_API_MAP;
const proxies = bridge.proxies;
const createModelIcon = (...args) => bridge.modelIcon(...args);
class ChatCompletionService {
static TYPE = 'openai';
static createRequestData({ stream = false, messages, model, chat_completion_source, max_tokens, temperature, custom_url, reverse_proxy, proxy_password, custom_prompt_post_processing, ...props }) {
        const payload = {
            stream,
            messages,
            model,
            chat_completion_source,
            max_tokens,
            temperature,
            custom_url,
            reverse_proxy,
            proxy_password,
            custom_prompt_post_processing,
            use_sysprompt: true,
            ...props,
        };

        // Remove undefined values to avoid API errors
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) {
                delete payload[key];
            }
        });

        return payload;
    }
static sendRequest(data, extractData = true, signal = null) { return bridge.sendRequest(this.TYPE, data, extractData, signal); }
static async processRequest(requestData, options, extractData = true, signal = null) {
        const { presetName } = options;
        requestData = this.createRequestData(requestData);

        // Apply generation preset if specified
        if (presetName) {
            const presetManager = getPresetManager(this.TYPE);
            if (presetManager) {
                const preset = presetManager.getCompletionPresetByName(presetName);
                if (preset) {
                    // Convert preset to payload and merge with custom parameters
                    requestData = await this.presetToGeneratePayload(preset, {}, requestData);
                } else {
                    console.warn(`Preset "${presetName}" not found, continuing with default settings`);
                }
            } else {
                console.warn('Preset manager not found, continuing with default settings');
            }
        }

        return await this.sendRequest(requestData, extractData, signal);
    }
static async presetToGeneratePayload(preset, overridePreset = {}, overridePayload = {}) {
        if (!preset || typeof preset !== 'object') {
            throw new Error('Invalid preset: must be an object');
        }

        // apply preset overrides
        preset = { ...preset, ...overridePreset };

        // Fix any fields before converting to settings
        preset.bias_preset_selected = preset.bias_presets !== undefined ? preset.bias_preset_selected : undefined;  // presets might have bias_preset_selected but not bias_presets, but settings need both or neither.

        // Convert from preset to ChatCompletionSettings
        const settings = structuredClone(oai_settings);
        for (const [key, value] of Object.entries(preset)) {
            const settingToUpdate = settingsToUpdate[key];
            if (!settingToUpdate) continue;
            settings[settingToUpdate[1]] = value;
        }

        // Ensure api-url is properly applied for all sources that accept it
        ['custom_url', 'vertexai_region', 'zai_endpoint', 'siliconflow_endpoint', 'minimax_endpoint', 'pollinations_endpoint'].forEach(field => {
            // The order is: connection profile => CC preset => CC settings
            overridePayload[field] = overridePayload[field] || settings[field] || oai_settings[field];
        });

        // Convert from settings to generation payload
        const data = await createGenerationParameters(settings, overridePayload.model, 'quiet', overridePayload.messages);
        const payload = data.generate_data;

        // apply overrides
        return this.createRequestData({ ...payload, ...overridePayload });
    }
}
class TextCompletionService {
static TYPE = 'textgenerationwebui';
static createRequestData({ stream = false, prompt, max_tokens, model, api_type, api_server, temperature, min_p, ...props }) {
        const payload = {
            stream,
            prompt,
            max_tokens,
            max_new_tokens: max_tokens,
            model,
            api_type,
            api_server: api_server ?? getTextGenServer(api_type),
            temperature,
            min_p,
            ...props,
        };

        // Remove undefined values to avoid API errors
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) {
                delete payload[key];
            }
        });

        return payload;
    }
static sendRequest(data, extractData = true, signal = null) { return bridge.sendRequest(this.TYPE, data, extractData, signal); }
static constructPrompt(prompt, instructPreset, instructSettings) {
        // InstructPreset may either be a name or itself a preset
        if (typeof instructPreset === 'string') {
            const instructPresetManager = getPresetManager('instruct');
            instructPreset = instructPresetManager?.getCompletionPresetByName(instructPreset);
        }

        // Clone the preset to avoid modifying the original
        instructPreset = structuredClone(instructPreset);
        if (instructSettings) {  // apply any additional settings
            Object.assign(instructPreset, instructSettings);
        }

        // Make the type check shut up. We 100% don't have a string here.
        if (typeof instructPreset === 'string') {
            return;
        }

        // Format messages using instruct formatting
        const formattedMessages = [];
        const prefillActive = prompt.length > 0 ? prompt[prompt.length - 1].role === 'assistant' : false;
        for (const message of prompt) {
            let messageContent = message.content;
            if (!message.ignoreInstruct) {
                const isLastMessage = message === prompt[prompt.length - 1];

                // This complicated logic means:
                // 1. If prefill is not active, format all messages
                // 2. If prefill is active, format all messages except the last one
                if (!isLastMessage || !prefillActive) {
                    messageContent = formatInstructModeChat(
                        message.name ?? message.role,
                        message.content,
                        message.role === 'user',
                        message.role === 'system',
                        undefined,
                        context.name1,  // for macros
                        context.name2,  // for macros
                        undefined,
                        instructPreset,
                    );
                }

                // Add prompt formatting for the last message.
                // e.g. "<|im_start|>assistant"
                if (isLastMessage) {
                    let last_line = formatInstructModePrompt(
                        'assistant',  // for sequences using {{name}}
                        false,  // not an impersonation
                        prefillActive ? message.content : undefined,  // if using prefill, last message is the prefill
                        context.name1,  // for macros
                        context.name2,  // for macros
                        true,   // quiet
                        false,
                        instructPreset,
                    );

                    if (prefillActive) {  // content is the prefilled message
                        if (last_line.endsWith('\n') && !message.content.endsWith('\n')) {
                            last_line = last_line.slice(0, -1);  // remove newline after prefill if it's not in the prefill itself
                        }
                        messageContent = last_line;
                    } else {  // append last line to content (e.g. "<|im_start|>assistant:")
                        messageContent += last_line;
                    }
                }
            }
            formattedMessages.push(messageContent);
        }
        return formattedMessages.join('');
    }
static async processRequest(requestData, options = {}, extractData = true, signal = null) {
        const { presetName, instructName } = options;

        // remove any undefined params in given request data
        requestData = this.createRequestData(requestData);

        /** @type {InstructSettings | undefined} */
        let instructPreset;
        const prompt = requestData.prompt;
        // Handle instruct formatting if requested
        if (Array.isArray(prompt)) {
            if (instructName) {
                const instructPresetManager = getPresetManager('instruct');
                instructPreset = instructPresetManager?.getCompletionPresetByName(instructName);
                if (instructPreset) {
                    requestData.prompt = this.constructPrompt(prompt, instructPreset, options.instructSettings);
                    const stoppingStrings = getInstructStoppingSequences({ customInstruct: instructPreset, useStopStrings: false });
                    requestData.stop = stoppingStrings;
                    requestData.stopping_strings = stoppingStrings;
                } else {
                    console.warn(`Instruct preset "${instructName}" not found, using basic formatting`);
                    requestData.prompt = prompt.map(x => x.content).join('\n\n');
                }
            } else {
                requestData.prompt = prompt.map(x => x.content).join('\n\n');
            }
        } else if (typeof prompt === 'string') {
            requestData.prompt = prompt;
        }

        // Apply generation preset if specified
        if (presetName) {
            const presetManager = getPresetManager(this.TYPE);
            if (presetManager) {
                const preset = presetManager.getCompletionPresetByName(presetName);
                if (preset) {
                    // Convert preset to payload and merge with custom data
                    requestData = this.presetToGeneratePayload(preset, {}, requestData);
                } else {
                    console.warn(`Preset "${presetName}" not found, continuing with default settings`);
                }
            } else {
                console.warn('Preset manager not found, continuing with default settings');
            }
        }

        const response = await this.sendRequest(requestData, extractData, signal);

        // Remove stopping strings from the end
        if (!requestData.stream && extractData) {
            /** @type {ExtractedData} */
            // @ts-ignore
            const extractedData = response;

            let message = extractedData.content;

            message = message.replace(/[^\S\r\n]+$/gm, '');

            if (requestData.stopping_strings) {
                for (const stoppingString of requestData.stopping_strings) {
                    if (stoppingString.length) {
                        for (let j = stoppingString.length; j > 0; j--) {
                            if (message.slice(-j) === stoppingString.slice(0, j)) {
                                message = message.slice(0, -j);
                                break;
                            }
                        }
                    }
                }
            }

            if (instructPreset) {
                [
                    instructPreset.stop_sequence,
                    instructPreset.input_sequence,
                ].forEach(sequence => {
                    if (sequence?.trim()) {
                        const index = message.indexOf(sequence);
                        if (index !== -1) {
                            message = message.substring(0, index);
                        }
                    }
                });

                [
                    instructPreset.output_sequence,
                    instructPreset.last_output_sequence,
                ].forEach(sequences => {
                    if (sequences) {
                        sequences.split('\n')
                            .filter(line => line.trim() !== '')
                            .forEach(line => {
                                message = message.replaceAll(line, '');
                            });
                    }
                });
            }

            extractedData.content = message;
        }

        return response;
    }
static presetToGeneratePayload(preset, overridePreset = {}, overridePayload = {}) {
        if (!preset || typeof preset !== 'object') {
            throw new Error('Invalid preset: must be an object');
        }

        // apply preset overrides
        preset = { ...preset, ...overridePreset };

        // Only take fields from the preset specified in setting_names to use as TextCompletionSettings
        const settings = structuredClone(bridge.textSettingsSnapshot());
        for (const [key, value] of Object.entries(preset)) {
            if (!setting_names.includes(key)) continue;
            settings[key] = value;
        }

        // convert to a generation payload
        const payload = createTextGenGenerationData(settings, overridePayload.model, overridePayload.prompt, preset.genamt);

        // apply overrides
        return this.createRequestData({ ...payload, ...overridePayload });
    }
}
class ConnectionManagerRequestService {
static defaultSendRequestParams = {
        stream: false,
        signal: null,
        extractData: true,
        includePreset: true,
        includeInstruct: true,
        instructSettings: {},
    };
static getAllowedTypes() {
        return {
            openai: t`Chat Completion`,
            textgenerationwebui: t`Text Completion`,
        };
    }
static async sendRequest(profileId, prompt, maxTokens, custom = this.defaultSendRequestParams, overridePayload = {}) {
        const { stream, signal, extractData, includePreset, includeInstruct, instructSettings } = { ...this.defaultSendRequestParams, ...custom };

        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);

        try {
            switch (selectedApiMap.selected) {
                case 'openai': {
                    if (!selectedApiMap.source) {
                        throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                    }

                    const proxyPreset = proxies.find((p) => p.name === profile.proxy);

                    const messages = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
                    return await context.ChatCompletionService.processRequest({
                        stream,
                        messages,
                        max_tokens: maxTokens,
                        model: profile.model,
                        chat_completion_source: selectedApiMap.source,
                        secret_id: profile['secret-id'],
                        custom_url: profile['api-url'],
                        vertexai_region: profile['api-url'],
                        zai_endpoint: profile['api-url'],
                        siliconflow_endpoint: profile['api-url'],
                        minimax_endpoint: profile['api-url'],
                        pollinations_endpoint: profile['api-url'],
                        reverse_proxy: proxyPreset?.url,
                        proxy_password: proxyPreset?.password,
                        custom_prompt_post_processing: profile['prompt-post-processing'],
                        ...overridePayload,
                    }, {
                        presetName: includePreset ? profile.preset : undefined,
                    }, extractData, signal);
                }
                case 'textgenerationwebui': {
                    if (!selectedApiMap.type) {
                        throw new Error(`API type ${selectedApiMap.selected} does not support text completions`);
                    }

                    return await context.TextCompletionService.processRequest({
                        stream,
                        prompt,
                        max_tokens: maxTokens,
                        model: profile.model,
                        api_type: selectedApiMap.type,
                        api_server: profile['api-url'],
                        secret_id: profile['secret-id'],
                        ...overridePayload,
                    }, {
                        instructName: includeInstruct ? profile.instruct : undefined,
                        presetName: includePreset ? profile.preset : undefined,
                        instructSettings: includeInstruct ? instructSettings : undefined,
                    }, extractData, signal);
                }
                default: {
                    throw new Error(`Unknown API type ${selectedApiMap.selected}`);
                }
            }
        } catch (error) {
            throw new Error('API request failed', { cause: error });
        }
    }
static constructPrompt(prompt, profileId, instructSettings = null) {
        const context = SillyTavern.getContext();
        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);
        const instructName = profile.instruct;

        switch (selectedApiMap.selected) {
            case 'openai': {
                if (!selectedApiMap.source) {
                    throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                }
                return prompt;
            }
            case 'textgenerationwebui': {
                if (!selectedApiMap.type) {
                    throw new Error(`API type ${selectedApiMap.selected} does not support text completions`);
                }
                return context.TextCompletionService.constructPrompt(prompt, instructName, instructSettings);
            }
            default: {
                throw new Error(`Unknown API type ${selectedApiMap.selected}`);
            }
        }
    }
static getSupportedProfiles() {
        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profiles = context.extensionSettings.connectionManager.profiles;
        return profiles.filter((p) => this.isProfileSupported(p));
    }
static getProfile(profileId) {
        const profile = SillyTavern.getContext().extensionSettings.connectionManager.profiles.find((p) => p.id === profileId);
        if (!profile) throw new Error(`Profile not found (ID: ${profileId})`);
        return profile;
    }
static getProfileIcon(profileId) {
        if ((SillyTavern.getContext()).extensionSettings.disabledExtensions.includes('connection-manager')) {
            return null;
        }

        const id = profileId ?? (SillyTavern.getContext()).extensionSettings.connectionManager.selectedProfile;
        if (!id) return null;

        try {
            const profile = this.getProfile(id);
            if (!profile?.api) return null;
            return createModelIcon(profile.api, profile.model);
        } catch {
            return null;
        }
    }
static isProfileSupported(profile) {
        if (!profile || !profile.api) {
            return false;
        }

        const apiMap = CONNECT_API_MAP[profile.api];
        if (!Object.hasOwn(this.getAllowedTypes(), apiMap.selected)) {
            return false;
        }

        // Some providers not need model, like koboldcpp. But I don't want to check by provider.
        switch (apiMap.selected) {
            case 'openai':
                return !!apiMap.source;
            case 'textgenerationwebui':
                return !!apiMap.type;
        }

        return false;
    }
static validateProfile(profile) {
        if (!profile) {
            throw new Error('Could not find profile.');
        }
        if (!profile.api) {
            throw new Error('Select a connection profile that has an API');
        }

        const context = SillyTavern.getContext();
        const selectedApiMap = context.CONNECT_API_MAP[profile.api];
        if (!selectedApiMap) {
            throw new Error(`Unknown API type ${profile.api}`);
        }
        if (!Object.hasOwn(this.getAllowedTypes(), selectedApiMap.selected)) {
            throw new Error(`API type ${selectedApiMap.selected} is not supported. Supported types: ${Object.values(this.getAllowedTypes()).join(', ')}`);
        }

        return selectedApiMap;
    }
static handleDropdown(
        selector,
        initialSelectedProfileId,
        onChange = () => { },
        onCreate = () => { },
        unUpdate = () => { },
        onDelete = () => { },
    ) {
        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        /**
         * @type {JQuery<HTMLSelectElement>}
         */
        const dropdown = $(selector);

        if (!dropdown || !dropdown.length) {
            throw new Error(`Could not find dropdown with selector ${selector}`);
        }

        dropdown.empty();

        // Create default option using document.createElement
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a Connection Profile';
        defaultOption.dataset.i18n = 'Select a Connection Profile';
        dropdown.append(defaultOption);

        const profiles = context.extensionSettings.connectionManager.profiles;

        // Create optgroups using document.createElement
        const groups = {};
        for (const [apiType, groupLabel] of Object.entries(this.getAllowedTypes())) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupLabel;
            groups[apiType] = optgroup;
        }

        const sortedProfilesByGroup = {};
        for (const apiType of Object.keys(this.getAllowedTypes())) {
            sortedProfilesByGroup[apiType] = [];
        }

        for (const profile of profiles) {
            if (this.isProfileSupported(profile)) {
                const apiMap = CONNECT_API_MAP[profile.api];
                if (sortedProfilesByGroup[apiMap.selected]) {
                    sortedProfilesByGroup[apiMap.selected].push(profile);
                }
            }
        }

        // Sort each group alphabetically and add to dropdown
        for (const [apiType, groupProfiles] of Object.entries(sortedProfilesByGroup)) {
            if (groupProfiles.length === 0) continue;

            groupProfiles.sort((a, b) => a.name.localeCompare(b.name));

            const group = groups[apiType];
            for (const profile of groupProfiles) {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                group.appendChild(option);
            }
        }

        for (const group of Object.values(groups)) {
            if (group.children.length > 0) {
                dropdown.append(group);
            }
        }

        const selectedProfile = profiles.find((p) => p.id === initialSelectedProfileId);
        if (selectedProfile) {
            dropdown.val(selectedProfile.id);
        }

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_CREATED, async (profile) => {
            const isSupported = this.isProfileSupported(profile);
            if (!isSupported) {
                return;
            }

            const group = groups[CONNECT_API_MAP[profile.api].selected];
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            group.appendChild(option);

            await onCreate(profile);
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_UPDATED, async (oldProfile, newProfile) => {
            const currentSelected = dropdown.val();
            const isSelectedProfile = currentSelected === oldProfile.id;
            await unUpdate(oldProfile, newProfile);

            if (!this.isProfileSupported(newProfile)) {
                if (isSelectedProfile) {
                    dropdown.val('');
                    dropdown.trigger('change');
                }
                return;
            }

            const group = groups[CONNECT_API_MAP[newProfile.api].selected];
            const oldOption = group.querySelector(`option[value="${oldProfile.id}"]`);
            if (oldOption) {
                oldOption.remove();
            }

            const option = document.createElement('option');
            option.value = newProfile.id;
            option.textContent = newProfile.name;
            group.appendChild(option);

            if (isSelectedProfile) {
                // Ackchyually, we don't need to reselect but what if id changes? It is not possible for now I couldn't stop myself.
                dropdown.val(newProfile.id);
                dropdown.trigger('change');
            }
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_DELETED, async (profile) => {
            const currentSelected = dropdown.val();
            const isSelectedProfile = currentSelected === profile.id;
            if (!this.isProfileSupported(profile)) {
                return;
            }

            const group = groups[CONNECT_API_MAP[profile.api].selected];
            const optionToRemove = group.querySelector(`option[value="${profile.id}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }

            if (isSelectedProfile) {
                dropdown.val('');
                dropdown.trigger('change');
            }

            await onDelete(profile);
        });

        dropdown.on('change', async () => {
            const profileId = dropdown.val();
            const profile = context.extensionSettings.connectionManager.profiles.find((p) => p.id === profileId);
            await onChange(profile);
        });
    }
}
return { ChatCompletionService, TextCompletionService, ConnectionManagerRequestService };
}
