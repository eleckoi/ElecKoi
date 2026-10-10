// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original public model methods.
import { substituteParams } from '../../../../tavern-runtime/host.js';
import { uuidv4 } from './utils.js';
const DEFAULT_ORDER = 100;
export class Prompt {
    /**
     * Indicates if the prompt is enabled.
     * @type {boolean}
     */
    enabled;

    /**
     * Unique identifier for the prompt.
     * @type {string}
     */
    identifier;

    /**
     * Role of the prompt, e.g., 'system', 'user', etc.
     * @type {string}
     */
    role;

    /**
     * Content of the prompt.
     * @type {string}
     */
    content;

    /**
     * Display name of the prompt.
     * @type {string}
     */
    name;

    /**
     * Indicates if the prompt is a system prompt.
     * @type {boolean}
     */
    system_prompt;

    /**
     * Position of the prompt in the prompt list.
     * @type {string|number}
     */
    position;

    /**
     * Inject position of the prompt (relative = 0 or in-chat = 1)
     * @type {number}
     */
    injection_position;

    /**
     * Depth of the prompt in the chat.
     * @type {number}
     */
    injection_depth;

    /**
     * Order of the prompt in the chat.
     * @type {number}
     */
    injection_order;

    /**
     * Indicates if the prompt should not be overridden.
     * @type {boolean}
     */
    forbid_overrides;

    /**
     * Prompt is added by an extension.
     * @type {boolean}
     */
    extension;

    /**
     * A list of generation type triggers for the prompt injection.
     * @type {string[]}
     */
    injection_trigger;

    /**
     * Indicates if the prompt is a marker prompt.
     * @type {boolean}
     */
    marker;

    /**
     * Create a new Prompt instance.
     *
     * @param {Object} [param0] - Object containing the properties of the prompt.
     * @param {string} [param0.identifier] - The unique identifier of the prompt.
     * @param {string} [param0.role] - The role associated with the prompt.
     * @param {string} [param0.content] - The content of the prompt.
     * @param {string} [param0.name] - The name of the prompt.
     * @param {boolean} [param0.system_prompt] - Indicates if the prompt is a system prompt.
     * @param {string|number} [param0.position] - The position of the prompt in the prompt list.
     * @param {number} [param0.injection_position] - The insert position of the prompt.
     * @param {number} [param0.injection_depth] - The depth of the prompt in the chat.
     * @param {number} [param0.injection_order] - The order of the prompt in the chat.
     * @param {string[]} [param0.injection_trigger] - The generation type trigger for the prompt injection.
     * @param {boolean} [param0.forbid_overrides] - Indicates if the prompt should not be overridden.
     * @param {boolean} [param0.extension] - Prompt is added by an extension.
     */
    constructor({ identifier, role, content, name, system_prompt, position, injection_depth, injection_position, forbid_overrides, extension, injection_order, injection_trigger } = {}) {
        this.identifier = identifier;
        this.role = role;
        this.content = content;
        this.name = name;
        this.system_prompt = system_prompt;
        this.position = position;
        this.injection_depth = injection_depth;
        this.injection_position = injection_position;
        this.forbid_overrides = forbid_overrides;
        this.extension = extension ?? false;
        this.injection_order = injection_order ?? DEFAULT_ORDER;
        this.injection_trigger = injection_trigger ?? [];
    }
}

export class PromptCollection {
    /**
     * List of Prompts in the collection.
     * @type {Prompt[]}
     */
    collection = [];

    /**
     * List of identifiers of prompts that have been overridden.
     * @type {string[]}
     */
    overriddenPrompts = [];

    /**
     * Create a new PromptCollection instance.
     *
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    constructor(...prompts) {
        this.add(...prompts);
    }

    /**
     * Checks if the provided instances are of the Prompt class.
     *
     * @param {...Prompt} prompts - Instances to check.
     * @throws Will throw an error if one or more instances are not of the Prompt class.
     */
    checkPromptInstance(...prompts) {
        for (let prompt of prompts) {
            if (!(prompt instanceof Prompt)) {
                throw new Error('Only Prompt instances can be added to PromptCollection');
            }
        }
    }

    /**
     * Adds new Prompt instances to the collection.
     *
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    add(...prompts) {
        this.checkPromptInstance(...prompts);
        this.collection.push(...prompts);
    }

    /**
     * Sets a Prompt instance at a specific position in the collection.
     *
     * @param {Prompt} prompt - The Prompt instance to set.
     * @param {number} position - The position in the collection to set the Prompt instance.
     */
    set(prompt, position) {
        this.checkPromptInstance(prompt);
        this.collection[position] = prompt;
    }

    /**
     * Retrieves a Prompt instance from the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to retrieve.
     * @returns {Prompt} The Prompt instance with the provided identifier, or undefined if not found.
     */
    get(identifier) {
        return this.collection.find(prompt => prompt.identifier === identifier);
    }

    /**
     * Retrieves the index of a Prompt instance in the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to find.
     * @returns {number} The index of the Prompt instance in the collection, or -1 if not found.
     */
    index(identifier) {
        return this.collection.findIndex(prompt => prompt.identifier === identifier);
    }

    /**
     * Checks if a Prompt instance exists in the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to check.
     * @returns {boolean} true if the Prompt instance exists in the collection, false otherwise.
     */
    has(identifier) {
        return this.index(identifier) !== -1;
    }

    /**
     * Overrides a prompt at a specific position in the collection.
     *
     * @param {Prompt} prompt - The Prompt instance to override.
     * @param {number} position - The position in the collection to override the Prompt instance.
     */
    override(prompt, position) {
        this.set(prompt, position);
        this.overriddenPrompts.push(prompt.identifier);
    }
}
export class TokenHandler {
    /**
     * @param {(messages: object[] | object, full?: boolean) => Promise<number>} countTokenAsyncFn Function to count tokens
     */
    constructor(countTokenAsyncFn) {
        this.countTokenAsyncFn = countTokenAsyncFn;
        this.counts = {
            'start_chat': 0,
            'prompt': 0,
            'bias': 0,
            'nudge': 0,
            'jailbreak': 0,
            'impersonate': 0,
            'examples': 0,
            'conversation': 0,
        };
    }

    getCounts() {
        return this.counts;
    }

    resetCounts() {
        Object.keys(this.counts).forEach((key) => this.counts[key] = 0);
    }

    setCounts(counts) {
        this.counts = counts;
    }

    uncount(value, type) {
        this.counts[type] -= value;
    }

    /**
     * Count tokens for a message or messages.
     * @param {object|any[]} messages Messages to count tokens for
     * @param {boolean} [full] Count full tokens
     * @param {string} [type] Identifier for the token count
     * @returns {Promise<number>} The token count
     */
    async countAsync(messages, full, type) {
        const token_count = await this.countTokenAsyncFn(messages, full);
        this.counts[type] += token_count;

        return token_count;
    }

    getTokensForIdentifier(identifier) {
        return this.counts[identifier] ?? 0;
    }

    getTotal() {
        return Object.values(this.counts).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
    }

    log() {
        console.table({ ...this.counts, 'total': this.getTotal() });
    }
}
export class PromptManagerCore {
updatePromptByIdentifier(identifier, updatePrompt) {
        let prompt = this.serviceSettings.prompts.find((item) => identifier === item.identifier);
        if (prompt) prompt = Object.assign(prompt, updatePrompt);
    }

updatePrompts(prompts) {
        prompts.forEach((update) => {
            let prompt = this.getPromptById(update.identifier);
            if (prompt) Object.assign(prompt, update);
        });
    }

getTokenHandler() {
        return this.tokenHandler;
    }

isPromptDisabledForActiveCharacter(identifier) {
        const promptOrderEntry = this.getPromptOrderEntry(this.activeCharacter, identifier);
        if (promptOrderEntry) return !promptOrderEntry.enabled;
        return false;
    }

appendPrompt(prompt, character) {
        const promptOrder = this.getPromptOrderForCharacter(character);
        const index = promptOrder.findIndex(entry => entry.identifier === prompt.identifier);

        if (-1 === index) promptOrder.unshift({ identifier: prompt.identifier, enabled: false });
    }

detachPrompt(prompt, character) {
        const promptOrder = this.getPromptOrderForCharacter(character);
        const index = promptOrder.findIndex(entry => entry.identifier === prompt.identifier);
        if (-1 === index) return;
        promptOrder.splice(index, 1);
    }

addPrompt(prompt, identifier) {
        if (typeof prompt !== 'object' || prompt === null) throw new Error('Object is not a prompt');

        const newPrompt = {
            identifier: identifier,
            system_prompt: false,
            enabled: false,
            marker: false,
            ...prompt,
        };

        this.serviceSettings.prompts.push(newPrompt);
    }

isPromptInspectionAllowed(prompt) {
        return true;
    }

isPromptDeletionAllowed(prompt) {
        return false === prompt.system_prompt;
    }

isPromptEditAllowed(prompt) {
        const forceEditPrompts = [
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
            'worldInfoBefore',
            'worldInfoAfter',
        ];
        return forceEditPrompts.includes(prompt.identifier) || !prompt.marker;
    }

isPromptToggleAllowed(prompt) {
        const forceTogglePrompts = [
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
            'worldInfoBefore',
            'worldInfoAfter',
            'main',
            'chatHistory',
            'dialogueExamples',
        ];
        return prompt.marker && !forceTogglePrompts.includes(prompt.identifier) ? false : !this.configuration.toggleDisabled.includes(prompt.identifier);
    }

getPromptsForCharacter(character, onlyEnabled = false) {
        return this.getPromptOrderForCharacter(character)
            .map(item => true === onlyEnabled ? (true === item.enabled ? this.getPromptById(item.identifier) : null) : this.getPromptById(item.identifier))
            .filter(prompt => null !== prompt);
    }

getPromptOrderForCharacter(character) {
        return !character ? [] : (this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(character.id))?.order ?? []);
    }

setPrompts(prompts) {
        this.serviceSettings.prompts = prompts;
    }

removePromptOrderForCharacter(character) {
        const index = this.serviceSettings.prompt_order.findIndex(list => String(list.character_id) === String(character.id));
        if (-1 !== index) this.serviceSettings.prompt_order.splice(index, 1);
    }

addPromptOrderForCharacter(character, promptOrder) {
        this.serviceSettings.prompt_order.push({
            character_id: character.id,
            order: JSON.parse(JSON.stringify(promptOrder)),
        });
    }

getPromptOrderEntry(character, identifier) {
        return this.getPromptOrderForCharacter(character).find(entry => entry.identifier === identifier) ?? null;
    }

getPromptById(identifier) {
        return this.serviceSettings.prompts.find(item => item && item.identifier === identifier) ?? null;
    }

getPromptIndexById(identifier) {
        return this.serviceSettings.prompts.findIndex(item => item.identifier === identifier) ?? null;
    }

preparePrompt(prompt, original = null) {
        const groupMembers = this.getActiveGroupCharacters();
        const preparedPrompt = new Prompt(prompt);

        if (typeof original === 'string') {
            if (0 < groupMembers.length) preparedPrompt.content = substituteParams(prompt.content ?? '', { original, groupOverride: groupMembers.join(', ') });
            else preparedPrompt.content = substituteParams(prompt.content, { original });
        } else {
            if (0 < groupMembers.length) preparedPrompt.content = substituteParams(prompt.content ?? '', { groupOverride: groupMembers.join(', ') });
            else preparedPrompt.content = substituteParams(prompt.content);
        }

        return preparedPrompt;
    }

isValidName(name) {
        const regex = /^[a-zA-Z0-9_]{1,64}$/;

        return regex.test(name);
    }

sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
    }

getPromptCollection(generationType) {
        generationType = String(generationType || 'normal').toLowerCase().trim();
        const promptCollection = new PromptCollection();
        const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);

        promptOrder.forEach(entry => {
            const prompt = this.getPromptById(entry.identifier);
            const allowedTrigger = entry.enabled && this.shouldTrigger(prompt, generationType);

            if (!prompt) {
                return;
            }

            if (allowedTrigger) {
                promptCollection.add(this.preparePrompt(prompt));
            } else if (entry.identifier === 'main') {
                // Some extensions require main prompt to be present for relative inserts.
                // So we make a GMO-free vegan replacement.
                const replacementPrompt = structuredClone(prompt);
                replacementPrompt.content = '';
                promptCollection.add(this.preparePrompt(replacementPrompt));
            }
        });

        return promptCollection;
    }

shouldTrigger(prompt, generationType) {
        if (!Array.isArray(prompt?.injection_trigger)) return true;
        if (!prompt.injection_trigger.length) return true;
        return prompt.injection_trigger.includes(generationType);
    }

setMessages(messages) {
        this.messages = messages;
    }

setChatCompletion(chatCompletion) {
        const messages = chatCompletion.getMessages();

        this.setMessages(messages);
        this.populateTokenCounts(messages);
        this.overriddenPrompts = chatCompletion.getOverriddenPrompts();
    }

populateTokenCounts(messages) {
        this.tokenHandler.resetCounts();
        const counts = this.tokenHandler.getCounts();
        messages.getCollection().forEach(message => {
            counts[message.identifier] = message.getTokens();
        });

        this.tokenUsage = this.tokenHandler.getTotal();

        this.log('Updated token usage with ' + this.tokenUsage);
    }

validateObject(controlObj, object) {
        for (let key in controlObj) {
            if (!Object.hasOwn(object, key)) {
                if (controlObj[key] === null) continue;
                else return false;
            }

            if (typeof controlObj[key] === 'object' && controlObj[key] !== null) {
                if (typeof object[key] !== 'object') return false;
                if (!this.validateObject(controlObj[key], object[key])) return false;
            } else {
                if (typeof object[key] !== typeof controlObj[key]) return false;
            }
        }

        return true;
    }

getFormattedDate() {
        const date = new Date();
        let month = String(date.getMonth() + 1);
        let day = String(date.getDate());
        const year = String(date.getFullYear());

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return `${month}_${day}_${year}`;
    }

getUuidv4() {
        return uuidv4();
    }
}
