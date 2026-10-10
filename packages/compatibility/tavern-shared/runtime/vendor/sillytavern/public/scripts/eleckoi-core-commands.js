// Extracted without semantic changes from ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127. AGPL-3.0.
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { stopGeneration, chat, system_message_types, main_api, extension_prompt_types, extension_prompt_roles, chat_metadata, setExtensionPrompt, eventSource, event_types, reloadCurrentChat } from '../script.js';
import { t } from './i18n.js';
import { SlashCommandClosure } from './slash-commands/SlashCommandClosure.js';
import { isFalseBoolean, delay, isTrueBoolean, stringToRange, trimToStartSentence, trimToEndSentence, regexFromString } from './utils.js';
import { SlashCommandNamedArgument, ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { resolveVariable } from './variables.js';
import { Fuse, DOMPurify } from '../lib.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from './slash-commands/SlashCommandEnumValue.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from './popup.js';
import { getTokenCountAsync, getFriendlyTokenizerName, getTextTokens, decodeTextTokens } from './tokenizers.js';
import { saveMetadataDebounced, getContext } from './extensions.js';
import { slashCommandReturnHelper } from './slash-commands/SlashCommandReturnHelper.js';
import { isMobile } from './RossAscends-mods.js';
import { SlashCommandExecutionError } from './slash-commands/SlashCommandExecutionError.js';
function abortCallback({ _abortController, quiet }, reason) {
    if (quiet instanceof SlashCommandClosure) throw new Error(t`argument 'quiet' cannot be a closure for command /abort`);
    _abortController.abort((reason ?? '').toString().length == 0 ? t`/abort command executed` : reason, !isFalseBoolean(quiet?.toString() ?? 'true'));
    return '';
}

function fuzzyCallback(args, searchInValue) {
    if (!searchInValue) {
        console.warn('WARN: No argument provided for /fuzzy command');
        return '';
    }

    if (!args.list) {
        console.warn('WARN: No list argument provided for /fuzzy command');
        return '';
    }

    try {
        const list = JSON.parse(resolveVariable(args.list));
        if (!Array.isArray(list)) {
            console.warn('WARN: Invalid list argument provided for /fuzzy command');
            return '';
        }

        const params = {
            includeScore: true,
            findAllMatches: true,
            ignoreLocation: true,
            threshold: 0.4,
        };
        // threshold determines how strict is the match, low threshold value is very strict, at 1 (nearly?) everything matches
        if ('threshold' in args) {
            params.threshold = parseFloat(args.threshold);
            if (isNaN(params.threshold)) {
                console.warn('WARN: \'threshold\' argument must be a float between 0.0 and 1.0 for /fuzzy command');
                return '';
            }
            if (params.threshold < 0) {
                params.threshold = 0;
            }
            if (params.threshold > 1) {
                params.threshold = 1;
            }
        }

        function getFirstMatch() {
            const fuse = new Fuse([searchInValue], params);
            // each item in the "list" is searched within "search_item", if any matches it returns the matched "item"
            for (const searchItem of list) {
                const result = fuse.search(searchItem);
                console.debug('/fuzzy: result', result);
                if (result.length > 0) {
                    console.info('/fuzzy: first matched', searchItem);
                    return searchItem;
                }
            }

            console.info('/fuzzy: no match');
            return '';
        }

        function getBestMatch() {
            const fuse = new Fuse(list, params);
            const result = fuse.search(searchInValue);
            console.debug('/fuzzy: result', result);
            if (result.length > 0) {
                console.info('/fuzzy: best matched', result[0].item);
                return result[0].item;
            }

            console.info('/fuzzy: no match');
            return '';
        }

        switch (String(args.mode).trim().toLowerCase()) {
            case 'best':
                return getBestMatch();
            case 'first':
            default:
                return getFirstMatch();
        }
    } catch {
        console.warn('WARN: Invalid list argument provided for /fuzzy command');
        return '';
    }
}

async function delayCallback(_, amount) {
    if (!amount) {
        console.warn('WARN: No amount provided for /delay command');
        return '';
    }

    amount = Number(amount);
    if (isNaN(amount)) {
        amount = 0;
    }

    await delay(amount);
    return '';
}

async function getMessagesCallback(args, value) {
    const includeNames = !isFalseBoolean(args?.names);
    const includeHidden = isTrueBoolean(args?.hidden);
    const role = args?.role;
    const range = stringToRange(value, 0, chat.length - 1);

    if (!range) {
        console.warn(`WARN: Invalid range provided for /messages command: ${value}`);
        return '';
    }

    const filterByRole = (mes) => {
        if (!role) {
            return true;
        }

        const isNarrator = mes.extra?.type === system_message_types.NARRATOR;

        if (role === 'system') {
            return isNarrator && !mes.is_user;
        }

        if (role === 'assistant') {
            return !isNarrator && !mes.is_user;
        }

        if (role === 'user') {
            return !isNarrator && mes.is_user;
        }

        throw new Error(t`Invalid role provided. Expected one of: system, assistant, user. Got: ${role}`);
    };

    const processMessage = async (mesId) => {
        const msg = chat[mesId];
        if (!msg) {
            console.warn(`WARN: No message found with ID ${mesId}`);
            return null;
        }

        if (role && !filterByRole(msg)) {
            console.debug(`/messages: Skipping message with ID ${mesId} due to role filter`);
            return null;
        }

        if (!includeHidden && msg.is_system) {
            console.debug(`/messages: Skipping hidden message with ID ${mesId}`);
            return null;
        }

        return includeNames ? `${msg.name}: ${msg.mes}` : msg.mes;
    };

    const messagePromises = [];

    for (let rInd = range.start; rInd <= range.end; ++rInd)
        messagePromises.push(processMessage(rInd));

    const messages = await Promise.all(messagePromises);

    return messages.filter(m => m !== null).join('\n\n');
}

async function popupCallback(args, value) {
    const safeBody = DOMPurify.sanitize(value || '');
    const safeHeader = args?.header && typeof args?.header === 'string' ? DOMPurify.sanitize(args.header) : null;
    const requestedResult = isTrueBoolean(args?.result);

    /** @type {import('./popup.js').PopupOptions} */
    const popupOptions = {
        allowVerticalScrolling: !isFalseBoolean(args?.scroll),
        large: isTrueBoolean(args?.large),
        wide: isTrueBoolean(args?.wide),
        wider: isTrueBoolean(args?.wider),
        transparent: isTrueBoolean(args?.transparent),
        okButton: args?.okButton !== undefined && typeof args?.okButton === 'string' ? args.okButton : t`OK`,
        cancelButton: args?.cancelButton !== undefined && typeof args?.cancelButton === 'string' ? args.cancelButton : null,
        tooltip: args?.tooltip !== undefined && typeof args?.tooltip === 'string' ? args.tooltip : null,
    };
    const result = await Popup.show.text(safeHeader, safeBody, popupOptions);
    return String(requestedResult ? result ?? '' : value);
}

async function buttonsCallback(args, text) {
    try {
        /** @type {(string|ButtonLabel)[]} */
        const rawButtons = JSON.parse(resolveVariable(args?.labels));

        if (!Array.isArray(rawButtons) || !rawButtons.length) {
            console.warn('WARN: Invalid labels provided for /buttons command');
            return '';
        }

        // Normalize buttons to ButtonLabel format for consistent handling
        /** @type {ButtonLabel[]} */
        const buttons = rawButtons.map(btn => typeof btn === 'string' ? { text: btn } : btn);

        // Validate raw buttons: each entry must be a string or a non-null object with a string `text` field that has content
        if (!buttons.every(btn => typeof btn === 'object' && btn !== null && typeof btn.text === 'string' && btn.text)) {
            console.warn('WARN: Invalid button label entry provided for /buttons command: each entry must be a string or an object with a "text" property');
            return '';
        }

        /** @type {Set<number>} */
        const multipleToggledState = new Set();
        const multiple = isTrueBoolean(args?.multiple);

        // Map custom buttons to results. Start at 2 because 1 and 0 are reserved for ok and cancel
        /** @type {Map<number, ButtonLabel>} */
        const resultToButtonMap = new Map(buttons.map((button, index) => [index + 2, button]));

        return new Promise(async (resolve) => {
            const safeValue = DOMPurify.sanitize(text || '');

            /** @type {Popup} */
            let popup;

            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('flex-container', 'flexFlowColumn', 'wide100p');

            const scrollableContainer = document.createElement('div');
            scrollableContainer.classList.add('scrollable-buttons-container');

            for (const [result, button] of resultToButtonMap) {
                const buttonElement = document.createElement('div');
                buttonElement.classList.add('menu_button', 'wide100p');

                if (multiple) {
                    buttonElement.classList.add('toggleable');
                    buttonElement.dataset.toggleValue = String(result);
                    buttonElement.addEventListener('click', async () => {
                        buttonElement.classList.toggle('toggled');
                        if (buttonElement.classList.contains('toggled')) {
                            multipleToggledState.add(result);
                        } else {
                            multipleToggledState.delete(result);
                        }
                    });
                } else {
                    buttonElement.classList.add('result-control');
                    buttonElement.dataset.result = String(result);
                }

                // Add icon if provided
                if (button.icon) {
                    const icon = document.createElement('i');
                    icon.className = `fa-solid ${button.icon}`;
                    icon.style.marginRight = '0.5em';
                    buttonElement.appendChild(icon);
                    const textSpan = document.createElement('span');
                    textSpan.textContent = button.text;
                    buttonElement.appendChild(textSpan);
                } else {
                    buttonElement.innerText = button.text;
                }

                // Add tooltip if provided
                if (button.tooltip) {
                    buttonElement.title = button.tooltip;
                    buttonElement.dataset.i18n = '[title]' + button.tooltip;
                }

                buttonContainer.appendChild(buttonElement);
            }

            scrollableContainer.appendChild(buttonContainer);

            const popupContainer = document.createElement('div');
            popupContainer.innerHTML = safeValue;
            popupContainer.appendChild(scrollableContainer);

            // Ensure the popup uses flex layout
            popupContainer.style.display = 'flex';
            popupContainer.style.flexDirection = 'column';
            popupContainer.style.maxHeight = '80vh'; // Limit the overall height of the popup

            popup = new Popup(popupContainer, POPUP_TYPE.TEXT, '', { okButton: multiple ? t`Ok` : t`Cancel`, allowVerticalScrolling: true });
            popup.show()
                .then((result => resolve(getResult(result))))
                .catch(() => resolve(''));

            /** @returns {string} @param {string|number|boolean} result */
            function getResult(result) {
                if (multiple) {
                    const array = result === POPUP_RESULT.AFFIRMATIVE ? Array.from(multipleToggledState).map(r => resultToButtonMap.get(r)?.text ?? '') : [];
                    return JSON.stringify(array);
                }
                return typeof result === 'number' ? resultToButtonMap.get(result)?.text ?? '' : '';
            }
        });
    } catch {
        return '';
    }
}

async function trimTokensCallback(arg, value) {
    if (!value) {
        console.warn('WARN: No argument provided for /trimtokens command');
        return '';
    }

    const limit = Number(resolveVariable(arg.limit));

    if (isNaN(limit)) {
        console.warn(`WARN: Invalid limit provided for /trimtokens command: ${limit}`);
        return value;
    }

    if (limit <= 0) {
        return '';
    }

    const direction = arg.direction || 'end';
    const tokenCount = await getTokenCountAsync(value);

    // Token count is less than the limit, do nothing
    if (tokenCount <= limit) {
        return value;
    }

    const { tokenizerName, tokenizerId } = getFriendlyTokenizerName(main_api);
    console.debug('Requesting tokenization for /trimtokens command', tokenizerName);

    try {
        const textTokens = getTextTokens(tokenizerId, value);

        if (!Array.isArray(textTokens) || !textTokens.length) {
            console.warn('WARN: No tokens returned for /trimtokens command, falling back to estimation');
            const percentage = limit / tokenCount;
            const trimIndex = Math.floor(value.length * percentage);
            const trimmedText = direction === 'start' ? value.substring(trimIndex) : value.substring(0, value.length - trimIndex);
            return trimmedText;
        }

        const sliceTokens = direction === 'start' ? textTokens.slice(0, limit) : textTokens.slice(-limit);
        const { text } = decodeTextTokens(tokenizerId, sliceTokens);
        return text;
    } catch (error) {
        console.warn('WARN: Tokenization failed for /trimtokens command, returning original', error);
        return value;
    }
}

function trimStartCallback(_, value) {
    if (!value) {
        return '';
    }

    return trimToStartSentence(value);
}

function trimEndCallback(_, value) {
    if (!value) {
        return '';
    }

    return trimToEndSentence(value);
}

function injectCallback(args, value) {
    const positions = {
        'before': extension_prompt_types.BEFORE_PROMPT,
        'after': extension_prompt_types.IN_PROMPT,
        'chat': extension_prompt_types.IN_CHAT,
        'none': extension_prompt_types.NONE,
    };
    const roles = {
        'system': extension_prompt_roles.SYSTEM,
        'user': extension_prompt_roles.USER,
        'assistant': extension_prompt_roles.ASSISTANT,
    };

    const id = String(args?.id ?? '') || Math.random().toString(36).substring(2);
    const ephemeral = isTrueBoolean(String(args?.ephemeral ?? ''));

    const defaultPosition = 'after';
    const defaultDepth = 4;
    const positionValue = args?.position ?? defaultPosition;
    const position = positions[positionValue] ?? positions[defaultPosition];
    const depthValue = Number(args?.depth ?? defaultDepth);
    const depth = isNaN(depthValue) ? defaultDepth : depthValue;
    const roleValue = typeof args?.role === 'string' ? args.role.toLowerCase().trim() : Number(args?.role ?? extension_prompt_roles.SYSTEM);
    const role = roles[roleValue] ?? extension_prompt_roles.SYSTEM;
    const scan = isTrueBoolean(String(args?.scan));
    const filter = args?.filter instanceof SlashCommandClosure ? args.filter.rawText : null;
    const filterFunction = args?.filter instanceof SlashCommandClosure ? closureToFilter(args.filter) : null;
    value = value || '';
    if (args?.filter && !String(filter ?? '').trim()) {
        throw new Error(t`Failed to parse the filter argument. Make sure it is a valid non-empty closure.`);
    }

    const prefixedId = `${SCRIPT_PROMPT_KEY}${id}`;

    if (!chat_metadata.script_injects) {
        chat_metadata.script_injects = {};
    }

    if (value) {
        const inject = { value, position, depth, scan, role, filter };
        chat_metadata.script_injects[id] = inject;
    } else {
        delete chat_metadata.script_injects[id];
    }

    setExtensionPrompt(prefixedId, String(value), position, depth, scan, role, filterFunction);
    saveMetadataDebounced();

    if (ephemeral) {
        let deleted = false;
        const unsetInject = () => {
            if (deleted) {
                return;
            }
            console.log('Removing ephemeral script injection', id);
            delete chat_metadata.script_injects[id];
            setExtensionPrompt(prefixedId, '', position, depth, scan, role, filterFunction);
            saveMetadataDebounced();
            deleted = true;
        };
        eventSource.once(event_types.GENERATION_ENDED, unsetInject);
        eventSource.once(event_types.GENERATION_STOPPED, unsetInject);
    }

    return id;
}

function closureToFilter(closure) {
    return async () => {
        try {
            const localClosure = closure.getCopy();
            localClosure.onProgress = () => { };
            const result = await localClosure.execute();
            return isTrueBoolean(result.pipe);
        } catch (e) {
            console.error('Error executing filter closure', e);
            return false;
        }
    };
}

const SCRIPT_PROMPT_KEY = 'script_inject_';

async function listInjectsCallback(args) {
    /** @type {import('./slash-commands/SlashCommandReturnHelper.js').SlashCommandReturnType} */
    let returnType = args.return;

    // Now the actual new return type handling
    const buildTextValue = (injects) => {
        const injectsStr = Object.entries(injects)
            .map(([id, inject]) => {
                const position = Object.entries(extension_prompt_types);
                const positionName = position.find(([_, value]) => value === inject.position)?.[0] ?? t`unknown`;
                return `* **${id}**: <code>${inject.value}</code> (${positionName}, ${t`depth`}: ${inject.depth}, ${t`scan`}: ${inject.scan ?? false}, ${t`role`}: ${inject.role ?? extension_prompt_roles.SYSTEM})`;
            })
            .join('\n');
        return `### ${t`Script injections:`}\n${injectsStr || t`No script injections for the current chat`}`;
    };

    return await slashCommandReturnHelper.doReturn(returnType ?? 'popup-html', chat_metadata.script_injects ?? {}, { objectToStringFunc: buildTextValue });
}

function flushInjectsCallback(_, value) {
    if (!chat_metadata.script_injects) {
        return '';
    }

    const idArgument = value;

    for (const [id, inject] of Object.entries(chat_metadata.script_injects)) {
        if (idArgument && id !== idArgument) {
            continue;
        }

        const prefixedId = `${SCRIPT_PROMPT_KEY}${id}`;
        setExtensionPrompt(prefixedId, '', inject.position, inject.depth, inject.scan, inject.role);
        delete chat_metadata.script_injects[id];
    }

    saveMetadataDebounced();
    return '';
}

export function processChatSlashCommands() {
    const context = getContext();

    if (!(context.chatMetadata.script_injects)) {
        return;
    }

    for (const id of Object.keys(context.extensionPrompts)) {
        if (!id.startsWith(SCRIPT_PROMPT_KEY)) {
            continue;
        }

        console.log('Removing script injection', id);
        delete context.extensionPrompts[id];
    }

    for (const [id, inject] of Object.entries(context.chatMetadata.script_injects)) {
        /**
         * Rehydrates a filter closure from a string.
         * @returns {SlashCommandClosure | null}
         */
        function reviveFilterClosure() {
            if (!inject.filter) {
                return null;
            }

            try {
                return new SlashCommandParser().parse(inject.filter, true);
            } catch (error) {
                console.warn('Failed to revive filter closure for script injection', id, error);
                return null;
            }
        }

        const prefixedId = `${SCRIPT_PROMPT_KEY}${id}`;
        const filterClosure = reviveFilterClosure();
        const filter = filterClosure ? closureToFilter(filterClosure) : null;
        console.log('Adding script injection', id);
        setExtensionPrompt(prefixedId, inject.value, inject.position, inject.depth, inject.scan, inject.role, filter);
    }
}
export function registerExtractedCommands() {
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'stop',
        callback: () => {
            const stopped = stopGeneration();
            return String(stopped);
        },
        returns: t`true/false, whether the generation was running and got stopped`,
        helpString: `
            <div>
                ${t`Stops the generation and any streaming if it is currently running.`}
            </div>
            <div>
                ${t`Note: This command cannot be executed from the chat input, as sending any message or script from there is blocked during generation. But it can be executed via automations or QR scripts/buttons.`}
            </div>
        `,
        aliases: ['generate-stop'],
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'abort',
        callback: abortCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: t`Whether to suppress the toast message notifying about the /abort call.`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`The reason for aborting command execution. Shown when quiet=false`,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        helpString: t`Aborts the slash command batch execution.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'fuzzy',
        callback: fuzzyCallback,
        returns: t`matching item`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'list',
                description: t`list of items to match against`,
                acceptsMultiple: false,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.LIST, ARGUMENT_TYPE.VARIABLE_NAME],
                enumProvider: commonEnumProviders.variables('all'),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'threshold',
                description: t`fuzzy match threshold (0.0 to 1.0)`,
                typeList: [ARGUMENT_TYPE.NUMBER],
                isRequired: false,
                defaultValue: '0.4',
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'mode',
                description: t`fuzzy match mode`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                defaultValue: 'first',
                acceptsMultiple: false,
                enumList: [
                    new SlashCommandEnumValue('first', t`first match below the threshold`, enumTypes.enum, enumIcons.default),
                    new SlashCommandEnumValue('best', t`best match below the threshold`, enumTypes.enum, enumIcons.default),
                ],
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to search`, [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: `
        <div>
            ${t`Performs a fuzzy match of each item in the <code>list</code> against the <code>text to search</code>. If any item matches, then its name is returned. If no item matches the text, no value is returned.`}
        </div>
        <div>
            ${t`The optional <code>threshold</code> (default is 0.4) allows control over the match strictness.`}
            ${t`A low value (min 0.0) means the match is very strict.`}
            ${t`At 1.0 (max) the match is very loose and will match anything.`}
        </div>
        <div>
            ${t`The optional <code>mode</code> argument allows to control the behavior when multiple items match the text.`}
            <ul>
                <li>${t`<code>first</code> (default) returns the first match below the threshold.`}</li>
                <li>${t`<code>best</code> returns the best match below the threshold.`}</li>
            </ul>
        </div>
        <div>
            ${t`The returned value passes to the next command through the pipe.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/fuzzy list=["a","b","c"] threshold=0.4 abc</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'pass',
        callback: (_, arg) => {
            // We do not support arrays of closures. Arrays of strings will be send as JSON
            if (Array.isArray(arg) && arg.some(x => x instanceof SlashCommandClosure)) throw new Error(t`Command /pass does not support multiple closures`);
            if (Array.isArray(arg)) return JSON.stringify(arg);
            return arg;
        },
        returns: t`the provided value`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.LIST, ARGUMENT_TYPE.DICTIONARY, ARGUMENT_TYPE.CLOSURE], true,
            ),
        ],
        aliases: ['return'],
        helpString: `
        <div>
            <pre><span class="monospace">/pass (text)</span> – ${t`passes the text to the next command through the pipe.`}</pre>
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li><pre><code>/pass Hello world</code></pre></li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'delay',
        callback: delayCallback,
        aliases: ['wait', 'sleep'],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`milliseconds`, [ARGUMENT_TYPE.NUMBER], true,
            ),
        ],
        helpString: `
        <div>
            ${t`Delays the next command in the pipe by the specified number of milliseconds.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/delay 1000</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'messages',
        callback: getMessagesCallback,
        aliases: ['message'],
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'names', t`show message author names`, [ARGUMENT_TYPE.BOOLEAN], false, false, 'off', commonEnumProviders.boolean('onOff')(),
            ),
            new SlashCommandNamedArgument(
                'hidden', t`include hidden messages`, [ARGUMENT_TYPE.BOOLEAN], false, false, 'on', commonEnumProviders.boolean('onOff')(),
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'role',
                description: t`filter messages by role`,
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: [
                    new SlashCommandEnumValue('system', null, enumTypes.enum, enumIcons.system),
                    new SlashCommandEnumValue('assistant', null, enumTypes.enum, enumIcons.assistant),
                    new SlashCommandEnumValue('user', null, enumTypes.enum, enumIcons.user),
                ],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`message index (starts with 0) or range`,
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                isRequired: true,
                enumProvider: commonEnumProviders.messages(),
            }),
        ],
        returns: t`the specified message or range of messages as a string`,
        helpString: `
        <div>
            ${t`Returns the specified message or range of messages as a string.`}
        </div>
        <div>
            ${t`Use the <code>hidden=off</code> argument to exclude hidden messages.`}
        </div>
        <div>
            ${t`Use the <code>role</code> argument to filter messages by role. Possible values are: system, assistant, user.`}
        </div>
        <div>
            <strong>${t`Examples:`}</strong>
            <ul>
                <li>
                    <pre><code>/messages 10</code></pre>
                    ${t`Returns the 10th message.`}
                </li>
                <li>
                    <pre><code>/messages names=on 5-10</code></pre>
                    ${t`Returns messages 5 through 10 with author names.`}
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'popup',
        callback: popupCallback,
        returns: t`Popup text`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'scroll',
                description: t`allows vertical scrolling of the content`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'true',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'large',
                description: t`show large popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'wide',
                description: t`show wide popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'wider',
                description: t`show wider popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'transparent',
                description: t`show transparent popup`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'okButton',
                description: t`text for the OK button`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'OK',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'cancelButton',
                description: t`text for the Cancel button`,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'result',
                description: t`if enabled, returns the popup result (as an integer) instead of the popup text. Resolves to 1 for OK and 0 cancel button, empty string for exiting out.`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'tooltip',
                description: t`tooltip text shown when hovering over the popup content area`,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`popup text`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
        <div>
            ${t`Shows a blocking popup with the specified text and buttons.`}
            ${t`Returns the popup text.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/popup large=on wide=on okButton="Confirm" Please confirm this action.</code></pre>
                </li>
                <li>
                    <pre><code>/popup okButton="Left" cancelButton="Right" result=true Do you want to go left or right? | /echo 0 means right, 1 means left. Choice: {{pipe}}</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'buttons',
        callback: buttonsCallback,
        returns: t`clicked button label (or array of labels if multiple is enabled)`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'labels',
                description: t`button labels - can be an array of strings or objects with text, tooltip, and icon properties`,
                typeList: [ARGUMENT_TYPE.LIST],
                isRequired: true,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'multiple',
                description: t`if enabled multiple buttons can be clicked/toggled, and all clicked buttons are returned as an array`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`text`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: `
        <div>
            ${t`Shows a blocking popup with the specified text and buttons.`}
            ${t`Returns the clicked button label into the pipe or empty string if canceled.`}
        </div>
        <div>
            ${t`Labels can be simple strings or objects with <code>text</code>, <code>tooltip</code>, and <code>icon</code> (Font Awesome class) properties.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/buttons labels=["Yes","No"] Do you want to continue?</code></pre>
                </li>
                <li>
                    <pre><code>/buttons labels=[{"text":"Save","icon":"fa-floppy-disk","tooltip":"Save changes"},{"text":"Cancel"}] Choose an action</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'trimtokens',
        callback: trimTokensCallback,
        returns: t`trimmed text`,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'limit', t`number of tokens to keep`, [ARGUMENT_TYPE.NUMBER], true,
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'direction',
                description: t`trim direction`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumList: [
                    new SlashCommandEnumValue('start', null, enumTypes.enum, '⏪'),
                    new SlashCommandEnumValue('end', null, enumTypes.enum, '⏩'),
                ],
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: `
        <div>
            ${t`Trims the start or end of text to the specified number of tokens.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/trimtokens limit=5 direction=start This is a long sentence with many words</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'trimstart',
        callback: trimStartCallback,
        returns: t`trimmed text`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: `
        <div>
            ${t`Trims the text to the start of the first full sentence.`}
        </div>
        <div>
            <strong>${t`Example:`}</strong>
            <ul>
                <li>
                    <pre><code>/trimstart This is a sentence. And here is another sentence.</code></pre>
                </li>
            </ul>
        </div>
    `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'trimend',
        callback: trimEndCallback,
        returns: t`trimmed text`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: t`Trims the text to the end of the last full sentence.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'inject',
        returns: t`injection ID`,
        callback: injectCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'id',
                description: t`injection ID`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumProvider: commonEnumProviders.injects,
            }),
            new SlashCommandNamedArgument(
                'position', t`injection position`, [ARGUMENT_TYPE.STRING], false, false, 'after', ['before', 'after', 'chat', 'none'],
            ),
            new SlashCommandNamedArgument(
                'depth', t`injection depth`, [ARGUMENT_TYPE.NUMBER], false, false, '4',
            ),
            new SlashCommandNamedArgument(
                'scan', t`include injection content into World Info scans`, [ARGUMENT_TYPE.BOOLEAN], false, false, 'false',
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'role',
                description: t`role for in-chat injections`,
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumList: [
                    new SlashCommandEnumValue('system', null, enumTypes.enum, enumIcons.system),
                    new SlashCommandEnumValue('assistant', null, enumTypes.enum, enumIcons.assistant),
                    new SlashCommandEnumValue('user', null, enumTypes.enum, enumIcons.user),
                ],
            }),
            new SlashCommandNamedArgument(
                'ephemeral', t`remove injection after generation`, [ARGUMENT_TYPE.BOOLEAN], false, false, 'false',
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'filter',
                description: t`if a filter is defined, an injection will only be performed if the closure returns true`,
                typeList: [ARGUMENT_TYPE.CLOSURE],
                isRequired: false,
                acceptsMultiple: false,
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: t`Injects a text into the LLM prompt for the current chat. Requires a unique injection ID (will be auto-generated if not provided). Positions: "before" main prompt, "after" main prompt, in-"chat", hidden with "none" (default: after). Depth: injection depth for the prompt (default: 4). Role: role for in-chat injections (default: system). Scan: include injection content into World Info scans (default: false). Hidden injects in "none" position are not inserted into the prompt but can be used for triggering WI entries. Returns the injection ID.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'listinjects',
        callback: listInjectsCallback,
        helpString: t`Lists all script injections for the current chat. Displays injects in a popup by default. Use the <code>return</code> argument to change the return type.`,
        returns: t`Optionally the JSON object of script injections`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'return',
                description: t`The way how you want the return value to be provided`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'popup-html',
                enumList: slashCommandReturnHelper.enumList({ allowPipe: false, allowObject: true, allowChat: true, allowPopup: true, allowTextVersion: false }),
                forceEnum: true,
            }),
        ],
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'flushinject',
        aliases: ['flushinjects'],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`injection ID or a variable name pointing to ID`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '',
                enumProvider: commonEnumProviders.injects,
            }),
        ],
        callback: flushInjectsCallback,
        helpString: t`Removes a script injection for the current chat. If no ID is provided, removes all script injections.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tokens',
        callback: async (_, text) => {
            if (text instanceof SlashCommandClosure || Array.isArray(text)) throw new Error(t`Unnamed argument cannot be a closure for command /tokens`);
            return String(await getTokenCountAsync(text));
        },
        returns: t`number of tokens`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text`, [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: t`Counts the number of tokens in the provided text.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'upper',
        aliases: ['uppercase', 'to-upper'],
        callback: (_, text) => typeof text === 'string' ? text.toUpperCase() : '',
        returns: t`uppercase string`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to affect`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: t`Converts the provided string to uppercase.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'lower',
        aliases: ['lowercase', 'to-lower'],
        callback: (_, text) => typeof text === 'string' ? text.toLowerCase() : '',
        returns: t`lowercase string`,
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to affect`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: t`Converts the provided string to lowercase.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'substr',
        aliases: ['substring'],
        callback: (arg, text) => typeof text === 'string' ? text.slice(...[Number(arg.start), arg.end && Number(arg.end)]) : '',
        returns: t`substring`,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'start', t`start index`, [ARGUMENT_TYPE.NUMBER], false, false,
            ),
            new SlashCommandNamedArgument(
                'end', t`end index`, [ARGUMENT_TYPE.NUMBER], false, false,
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to affect`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: `
            <div>
                ${t`Extracts text from the provided string.`}
            </div>
            <div>
                ${t`If <code>start</code> is omitted, it's treated as 0.<br />`}
                ${t`If <code>start</code> < 0, the index is counted from the end of the string.<br />`}
                ${t`If <code>start</code> >= the string's length, an empty string is returned.<br />`}
                ${t`If <code>end</code> is omitted, or if <code>end</code> >= the string's length, extracts to the end of the string.<br />`}
                ${t`If <code>end</code> < 0, the index is counted from the end of the string.<br />`}
                ${t`If <code>end</code> <= <code>start</code> after normalizing negative values, an empty string is returned.`}
            </div>
            <div>
                <strong>${t`Example:`}</strong>
                <pre>/let x The morning is upon us.     ||                                     </pre>
                <pre>/substr start=-3 {{var::x}}         | /echo  |/# us.                    ||</pre>
                <pre>/substr start=-3 end=-1 {{var::x}}  | /echo  |/# us                     ||</pre>
                <pre>/substr end=-1 {{var::x}}           | /echo  |/# The morning is upon us ||</pre>
                <pre>/substr start=4 end=-1 {{var::x}}   | /echo  |/# morning is upon us     ||</pre>
            </div>
        `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'is-mobile',
        callback: () => String(isMobile()),
        returns: ARGUMENT_TYPE.BOOLEAN,
        helpString: t`Returns true if the current device is a mobile device, false otherwise. Equivalent to <code>{{isMobile}}</code> macro.`,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'chat-reload',
        helpString: t`Reloads the current chat.`,
        callback: async () => {
            await reloadCurrentChat();
            return '';
        },
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'replace',
        aliases: ['re'],
        callback: (async ({ mode = 'literal', pattern, replacer = '' }, text) => {
            if (!pattern) {
                throw new Error(t`Argument of 'pattern=' cannot be empty`);
            }
            text = text.toString();
            pattern = pattern.toString();
            replacer = replacer.toString();
            switch (mode) {
                case 'literal':
                    return text.replaceAll(pattern, replacer);
                case 'regex':
                    return text.replace(regexFromString(pattern), replacer);
                default:
                    throw new Error(t`Invalid '/replace mode=' argument specified!`);
            }
        }),
        returns: t`replaced text`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'mode',
                description: t`Replaces occurrence(s) of a pattern`,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'literal',
                enumList: ['literal', 'regex'],
            }),
            new SlashCommandNamedArgument(
                'pattern', t`pattern to search with`, [ARGUMENT_TYPE.STRING], true, false,
            ),
            new SlashCommandNamedArgument(
                'replacer', t`replacement text for matches`, [ARGUMENT_TYPE.STRING], false, false, '',
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to affect`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: `
            <div>
                ${t`Replaces text within the provided string based on the pattern.`}
            </div>
            <div>
                ${t`If <code>mode</code> is <code>literal</code> (or omitted), <code>pattern</code> is a literal search string (case-sensitive).<br />`}
                ${t`If <code>mode</code> is <code>regex</code>, <code>pattern</code> is parsed as an ECMAScript Regular Expression.<br />`}
                ${t`The <code>replacer</code> replaces based on the <code>pattern</code> in the input text.<br />`}
                ${t`If <code>replacer</code> is omitted, the replacement(s) will be an empty string.<br />`}
            </div>
            <div>
                <strong>${t`Example:`}</strong>
                <pre><code class="language-stscript">/let x Blue house and blue car ||                                                                        </code></pre>
                <pre><code class="language-stscript">/replace pattern="blue" {{var::x}}                                | /echo  |/# Blue house and  car     ||</code></pre>
                <pre><code class="language-stscript">/replace pattern="blue" replacer="red" {{var::x}}                 | /echo  |/# Blue house and red car  ||</code></pre>
                <pre><code class="language-stscript">/replace mode=regex pattern="/blue/i" replacer="red" {{var::x}}   | /echo  |/# red house and blue car  ||</code></pre>
                <pre><code class="language-stscript">/replace mode=regex pattern="/blue/gi" replacer="red" {{var::x}}  | /echo  |/# red house and red car   ||</code></pre>
            </div>
        `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'test',
        callback: (({ pattern }, text) => {
            if (!pattern) {
                throw new Error(t`Argument of 'pattern=' cannot be empty`);
            }
            const re = regexFromString(pattern.toString());
            if (!re) {
                throw new Error(t`The value of 'pattern' argument is not a valid regular expression.`);
            }
            return JSON.stringify(re.test(text.toString()));
        }),
        returns: 'true | false',
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'pattern', t`pattern to find`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to test`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: `
            <div>
                ${t`Tests text for a regular expression match.`}
            </div>
            <div>
                ${t`Returns <code>true</code> if the match is found, <code>false</code> otherwise.`}
            </div>
            <div>
                <strong>${t`Example:`}</strong>
                <pre><code class="language-stscript">/let x Blue house and green car                         ||</code></pre>
                <pre><code class="language-stscript">/test pattern="green" {{var::x}}    | /echo  |/# true   ||</code></pre>
                <pre><code class="language-stscript">/test pattern="blue" {{var::x}}     | /echo  |/# false  ||</code></pre>
                <pre><code class="language-stscript">/test pattern="/blue/i" {{var::x}}  | /echo  |/# true   ||</code></pre>
            </div>
        `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'match',
        callback: (({ pattern }, text) => {
            if (!pattern) {
                throw new Error(t`Argument of 'pattern=' cannot be empty`);
            }
            const re = regexFromString(pattern.toString());
            if (!re) {
                throw new Error(t`The value of 'pattern' argument is not a valid regular expression.`);
            }
            if (re.flags.includes('g')) {
                return JSON.stringify([...text.toString().matchAll(re)]);
            } else {
                const match = text.toString().match(re);
                return match ? JSON.stringify(match) : '';
            }
        }),
        returns: t`group array for each match`,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'pattern', t`pattern to find`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                t`text to match against`, [ARGUMENT_TYPE.STRING], true, false,
            ),
        ],
        helpString: `
            <div>
                ${t`Retrieves regular expression matches in the given text`}
            </div>
            <div>
                ${t`Returns an array of groups (with the first group being the full match). If the regex contains the global flag (i.e. <code>/g</code>), multiple nested arrays are returned for each match. If the regex is global, returns <code>[]</code> if no matches are found, otherwise it returns an empty string.`}
            </div>
            <div>
                <strong>${t`Example:`}</strong>
                <pre><code class="language-stscript">/let x color_green green lamp color_blue                                                                            ||</code></pre>
                <pre><code class="language-stscript">/match pattern="green" {{var::x}}            | /echo  |/# [ "green" ]                                               ||</code></pre>
                <pre><code class="language-stscript">/match pattern="color_(\\w+)" {{var::x}}      | /echo  |/# [ "color_green", "green" ]                                ||</code></pre>
                <pre><code class="language-stscript">/match pattern="/color_(\\w+)/g" {{var::x}}   | /echo  |/# [ [ "color_green", "green" ], [ "color_blue", "blue" ] ]  ||</code></pre>
                <pre><code class="language-stscript">/match pattern="orange" {{var::x}}           | /echo  |/#                                                           ||</code></pre>
                <pre><code class="language-stscript">/match pattern="/orange/g" {{var::x}}        | /echo  |/# []                                                        ||</code></pre>
            </div>
        `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'reroll-pick',
        callback: (_, value) => {
            const currentSeed = chat_metadata.pick_reroll_seed ?? 0;
            const parsedValue = value ? parseInt(String(value), 10) : NaN;

            if (!isNaN(parsedValue)) {
                chat_metadata.pick_reroll_seed = parsedValue;
            } else {
                chat_metadata.pick_reroll_seed = currentSeed + 1;
            }

            saveMetadataDebounced();
            return String(chat_metadata.pick_reroll_seed);
        },
        returns: t`The new reroll seed value.`,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`Optional seed value to set. If not provided, increments current seed by 1.`,
                typeList: [ARGUMENT_TYPE.NUMBER],
            }),
        ],
        helpString: `
            <div>
                ${t`Rerolls all <code>{{pick}}</code> macro choices in the current chat.`}
            </div>
            <div>
                ${t`The <code>{{pick}}</code> macro normally keeps stable choices per chat. This command changes the seed used for all picks, causing them to resolve to (possibly) different values.`}
            </div>
            <div>
                ${t`If a number is provided, sets the seed to that value. Otherwise, increments the current seed by 1.`}
            </div>
            <div>
                <strong>${t`Example:`}</strong>
                <ul>
                    <li><pre><code>/reroll-pick</code></pre> ${t`Increments the seed by 1.`}</li>
                    <li><pre><code>/reroll-pick 5</code></pre> ${t`Sets the seed to 5.`}</li>
                </ul>
            </div>
        `,
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'array-wrap',
        aliases: ['list-wrap'],
        returns: t`unnamed argument value wrapped into an array`,
        helpString: t`Wraps a single unnamed argument into an array if it's not already an array. If the value is an empty string, returns an empty array.`,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'stringify',
                description: t`Whether JSON primitives (numbers, booleans, nulls) should be treated as strings, i.e. ["null"] when stringify=true vs. [null] when stringify=false.`,
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`value`,
                acceptsMultiple: false,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.DICTIONARY, ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.LIST],
            }),
        ],
        callback: (args, value) => {
            // Closures are not supported
            if (value instanceof SlashCommandClosure) {
                throw new SlashCommandExecutionError(t`Closures are not supported as unnamed arguments for /array-wrap. Did you forget to call the closure with parentheses?`);
            }

            // Multiple unnamed arguments are not supported since acceptsMultiple is false, but check just in case
            if (Array.isArray(value)) {
                throw new SlashCommandExecutionError(t`/array-wrap does not support multiple unnamed arguments.`);
            }

            // Empty string - empty arrays
            if (value === '') {
                return JSON.stringify([]);
            }

            try {
                // If the value is a valid JSON string, parse it
                const parsedValue = JSON.parse(value);

                // Already an array - return as-is
                if (Array.isArray(parsedValue)) {
                    return value;
                }

                // If it's an object, wrap it into an array and stringify
                if (typeof parsedValue === 'object' && parsedValue !== null) {
                    return JSON.stringify([parsedValue]);
                }

                // For primitive values, check if we should take the parsed or original value based on the stringify argument
                const isJsonPrimitive = parsedValue === null || ['string', 'number', 'boolean'].includes(typeof parsedValue);
                if (isJsonPrimitive && isFalseBoolean(String(args?.stringify?.toString()))) {
                    return JSON.stringify([parsedValue]);
                }

                // Wrap the original value (string, number, boolean) into an array, preserving quotes for strings
                return JSON.stringify([value]);
            } catch {
                // Not a valid JSON string - wrap the original value
                return JSON.stringify([value]);
            }
        },
    }));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'array-unwrap',
        aliases: ['list-unwrap'],
        returns: t`unnamed argument value unwrapped from an array`,
        helpString: t`Unwraps the first element of an array provided as an unnamed argument. If the value is not an array, returns the value as-is. If the array is empty, returns an empty string.`,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: t`value`,
                acceptsMultiple: false,
                isRequired: true,
                typeList: [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.DICTIONARY, ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.LIST],
            }),
        ],
        callback: (_args, value) => {
            // Closures are not supported
            if (value instanceof SlashCommandClosure) {
                throw new SlashCommandExecutionError(t`Closures are not supported as unnamed arguments for /array-unwrap. Did you forget to call the closure with parentheses?`);
            }

            // Multiple unnamed arguments are not supported since acceptsMultiple is false, but check just in case
            if (Array.isArray(value)) {
                throw new SlashCommandExecutionError(t`/array-unwrap does not support multiple unnamed arguments.`);
            }

            try {
                // If the value is a JSON array, get the first element
                const parsed = JSON.parse(value);

                if (Array.isArray(parsed)) {
                    const unwrappedValue = parsed?.[0] ?? '';

                    // If the first element is null or undefined, return an empty string
                    if (unwrappedValue === null || unwrappedValue === undefined) {
                        return '';
                    }

                    // If the first element is an object, stringify it.
                    if (typeof unwrappedValue === 'object') {
                        return JSON.stringify(unwrappedValue);
                    }

                    // Otherwise, return it as a string.
                    return String(unwrappedValue);
                }
                return value;
            } catch {
                // Not a valid JSON - return as-is
                return value;
            }
        },
    }));
}
