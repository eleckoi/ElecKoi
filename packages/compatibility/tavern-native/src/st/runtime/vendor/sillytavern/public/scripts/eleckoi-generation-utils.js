// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original raw prompt construction and reply cleanup.
import { power_user, selected_group, name1, name2, main_api, chat, characters, groups, substituteParams } from '../../../../tavern-runtime/host.js';
import { formatInstructModeChat, formatInstructModePrompt, formatInstructModeStoryString, getInstructStoppingSequences } from './eleckoi-instruct.js';
import { escapeRegex, trimToEndSentence } from './utils.js';
import { getRegexedString, regex_placement } from './extensions/regex/engine.js';
const onlyUnique = (value, index, array) => array.indexOf(value) === index;
export const EPHEMERAL_STOPPING_STRINGS = [];
export function countOccurrences(string, character) {
    let count = 0;

    for (let i = 0; i < string.length; i++) {
        if (string.substring(i, i + character.length) === character) {
            count++;
        }
    }

    return count;
}

export function isOdd(number) {
    return number % 2 !== 0;
}
export function adjustNovelInstructionPrompt(prompt) {
    const stripedPrompt = prompt.replace(/[[\]]/g, '').trim();
    if (!stripedPrompt.includes('{ ')) {
        return `{ ${stripedPrompt} }`;
    }
    return stripedPrompt;
}
export function collapseNewlines(x) {
    return x.replaceAll(/\n+/g, '\n');
}

export function fixMarkdown(text, forDisplay) {
    // Find pairs of formatting characters and capture the text in between them
    const format = /([*_]{1,2})([\s\S]*?)\1/gm;
    let matches = [];
    let match;
    while ((match = format.exec(text)) !== null) {
        matches.push(match);
    }

    // Iterate through the matches and replace adjacent spaces immediately beside formatting characters
    let newText = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        let matchText = matches[i][0];
        let replacementText = matchText.replace(/(\*|_)([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)|([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]+)(\*|_)/g, '$1$4');
        newText = newText.slice(0, matches[i].index) + replacementText + newText.slice(matches[i].index + matchText.length);
    }

    // Don't auto-fix asterisks if this is a message clean-up procedure.
    // It botches the continue function. Apply this to display only.
    if (!forDisplay) {
        return newText;
    }

    const splitText = newText.split('\n');

    // Fix asterisks, and quotes that are not paired
    for (let index = 0; index < splitText.length; index++) {
        const line = splitText[index];
        const charsToCheck = ['*', '"'];
        for (const char of charsToCheck) {
            if (line.includes(char) && isOdd(countOccurrences(line, char))) {
                splitText[index] = line.trimEnd() + char;
            }
        }
    }

    newText = splitText.join('\n');

    return newText;
}

export function getCustomStoppingStrings(limit = undefined) {
    function getPermanent() {
        try {
            // If there's no custom stopping strings, return an empty array
            if (!power_user.custom_stopping_strings) {
                return [];
            }

            // Parse the JSON string
            let strings = JSON.parse(power_user.custom_stopping_strings);

            // Make sure it's an array
            if (!Array.isArray(strings)) {
                return [];
            }

            // Make sure all the elements are strings and non-empty.
            strings = strings.filter(s => typeof s === 'string' && s.length > 0);

            // Substitute params if necessary
            if (power_user.custom_stopping_strings_macro) {
                strings = strings.map(x => substituteParams(x));
            }

            return strings;
        } catch (error) {
            // If there's an error, return an empty array
            console.warn('Error parsing custom stopping strings:', error);
            return [];
        }
    }

    const permanent = getPermanent();
    const ephemeral = EPHEMERAL_STOPPING_STRINGS;
    const strings = [...permanent, ...ephemeral];

    // Apply the limit. If limit is 0, return all strings.
    if (limit > 0) {
        return strings.slice(0, limit);
    }

    return strings;
}
export function getStoppingStrings(isImpersonate, isContinue, api = main_api) {
    // Only custom stop strings apply to Chat Completion
    if (api === 'openai') {
        return getCustomStoppingStrings();
    }

    const result = [];

    if (power_user.context.names_as_stop_strings) {
        const charString = `\n${name2}:`;
        const userString = `\n${name1}:`;
        result.push(isImpersonate ? charString : userString);

        result.push(userString);

        if (isContinue && Array.isArray(chat) && chat[chat.length - 1]?.is_user) {
            result.push(charString);
        }

        // Add group members as stopping strings if generating for a specific group member or user. (Allow slash commands to work around name stopping string restrictions)
        if (selected_group && (name2 || isImpersonate)) {
            const group = groups.find(x => x.id === selected_group);

            if (group && Array.isArray(group.members)) {
                const names = group.members
                    .map(x => characters.find(y => y.avatar == x))
                    .filter(x => x && x.name && x.name !== name2)
                    .map(x => `\n${x.name}:`);
                result.push(...names);
            }
        }
    }

    result.push(...getInstructStoppingSequences());
    result.push(...getCustomStoppingStrings());

    if (power_user.single_line) {
        result.unshift('\n');
    }

    return result.filter(x => x).filter(onlyUnique);
}

function cleanGroupMessage(getMessage) {
    if (power_user.disable_group_trimming) {
        return getMessage;
    }

    const group = groups.find((x) => x.id == selected_group);

    if (group && Array.isArray(group.members) && group.members) {
        for (let member of group.members) {
            const character = characters.find(x => x.avatar == member);

            if (!character) {
                continue;
            }

            const name = character.name;

            // Skip current speaker.
            if (name === name2) {
                continue;
            }

            const regex = new RegExp(`(^|\n)${escapeRegex(name)}:`);
            const nameMatch = getMessage.match(regex);
            if (nameMatch) {
                getMessage = getMessage.substring(0, nameMatch.index);
            }
        }
    }
    return getMessage;
}

export function createRawPrompt(prompt, api, instructOverride, quietToLoud, systemPrompt, prefill) {
    const isInstruct = power_user.instruct.enabled && api !== 'openai' && api !== 'novel' && !instructOverride;

    // If the prompt was given as a string, convert to a message-style object assuming user role
    if (typeof prompt === 'string') {
        const message = { role: 'user', content: prompt.trim() };
        prompt = [message];
    } else {  // checks for message-style object
        if (prompt.length === 0 && !systemPrompt) throw Error('No messages provided');
    }

    // Substitute the prefill if provided
    prefill = substituteParams(prefill ?? '');

    // Format each message in the prompt, accounting for the provided roles
    for (const message of prompt) {
        let name = '';
        if (message.role === 'user') name = message.name ?? name1;
        if (message.role === 'assistant') name = message.name ?? name2;
        if (message.role === 'system') name = message.name ?? '';
        const prefix = isInstruct || api === 'openai' ? '' : (name ? `${name}: ` : '');
        message.content = prefix + substituteParams(message.content ?? '');
        if (isInstruct) {  // instruct formatting for text completion
            const isUser = message.role === 'user';
            const isNarrator = message.role === 'system';
            message.content = formatInstructModeChat(name, message.content, isUser, isNarrator, '', name1, name2, false);
        }
    }

    // prepend system prompt, if provided
    if (systemPrompt) {
        systemPrompt = substituteParams(systemPrompt);
        systemPrompt = isInstruct ? formatInstructModeStoryString(systemPrompt) : systemPrompt.trim();
        if (isInstruct && systemPrompt.length > 0 && !systemPrompt.endsWith('\n')) {
            if (power_user.instruct.wrap && !power_user.instruct.story_string_suffix) {
                systemPrompt += '\n';
            }
        }
        prompt.unshift({ role: 'system', content: systemPrompt });
    }

    // with Chat Completion, the prefill is an additional assistant message at the end.
    if (api === 'openai' && prefill) {
        prompt.push({ role: 'assistant', content: prefill });
    }

    // if text completion, convert to text prompt by concatenating all message contents and adding the prefill as a promptBias.
    if (api !== 'openai') {
        const joiner = isInstruct ? '' : '\n';
        prompt = prompt.map(message => message.content).join(joiner);
        prompt = api === 'novel' ? adjustNovelInstructionPrompt(prompt) : prompt;
        prompt = prompt + (isInstruct ? formatInstructModePrompt(name2, false, prefill, name1, name2, true, quietToLoud) : `\n${prefill}`);  // add last line
    }

    return prompt;
}
export function cleanUpGeneratedMessage(parameters, reasoningPrefix = '') {
const PromptReasoning = { getLatestPrefix: () => reasoningPrefix };
function cleanUpMessage({ getMessage, isImpersonate, isContinue, displayIncompleteSentences = false, stoppingStrings = null, includeUserPromptBias = true, trimNames = true, trimWrongNames = true } = {}) {
    if (arguments.length > 0 && typeof arguments[0] !== 'object') {
        console.trace('cleanUpMessage called with positional arguments. Please use an object instead.');
        [getMessage, isImpersonate, isContinue, displayIncompleteSentences, stoppingStrings, includeUserPromptBias, trimNames, trimWrongNames] = arguments;
    }

    if (!getMessage) {
        return '';
    }

    // Add the prompt bias before anything else
    if (
        includeUserPromptBias &&
        power_user.user_prompt_bias &&
        !isImpersonate &&
        !isContinue &&
        power_user.user_prompt_bias.length !== 0
    ) {
        getMessage = substituteParams(power_user.user_prompt_bias) + getMessage;
    }

    // Allow for caching of stopping strings. getStoppingStrings is an expensive function, especially with macros
    // enabled, so for streaming, we call it once and then pass it into each cleanUpMessage call.
    if (!stoppingStrings) {
        stoppingStrings = getStoppingStrings(isImpersonate, isContinue, main_api);
    }

    for (const stoppingString of stoppingStrings) {
        if (stoppingString.length) {
            for (let j = stoppingString.length; j > 0; j--) {
                if (getMessage.slice(-j) === stoppingString.slice(0, j)) {
                    getMessage = getMessage.slice(0, -j);
                    break;
                }
            }
        }
    }

    // Regex uses vars, so add before formatting
    getMessage = getRegexedString(getMessage, isImpersonate ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT);

    if (power_user.collapse_newlines) {
        getMessage = collapseNewlines(getMessage);
    }

    // trailing invisible whitespace before every newlines, on a multiline string
    // "trailing whitespace on newlines       \nevery line of the string    \n?sample text" ->
    // "trailing whitespace on newlines\nevery line of the string\nsample text"
    getMessage = getMessage.replace(/[^\S\r\n]+$/gm, '');

    if (trimWrongNames) {
        // If this is an impersonation, delete the entire response if it starts with "{{char}}:"
        // If this isn't an impersonation, delete the entire response if it starts with "{{user}}:"
        // Also delete any trailing text that starts with the wrong name.
        // This only occurs if the corresponding "power_user.allow_nameX_display" is false.

        let wrongName = isImpersonate
            ? (!power_user.allow_name2_display ? name2 : '')  // char
            : (!power_user.allow_name1_display ? name1 : '');  // user

        if (wrongName) {
            // If the message starts with the wrong name, delete the entire response
            let startIndex = getMessage.indexOf(`${wrongName}:`);
            if (startIndex === 0) {
                getMessage = '';
                console.debug(`Message started with the wrong name: "${wrongName}" - response was deleted.`);
            }

            // If there is trailing text starting with the wrong name, trim it off.
            startIndex = getMessage.indexOf(`\n${wrongName}:`);
            if (startIndex >= 0) {
                getMessage = getMessage.substring(0, startIndex);
            }
        }
    }

    if (getMessage.indexOf('<|endoftext|>') != -1) {
        getMessage = getMessage.substring(0, getMessage.indexOf('<|endoftext|>'));
    }
    const isInstruct = power_user.instruct.enabled && main_api !== 'openai';
    const isNotEmpty = (str) => str && str.trim() !== '';
    if (isInstruct && power_user.instruct.stop_sequence) {
        if (getMessage.indexOf(power_user.instruct.stop_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(power_user.instruct.stop_sequence));
        }
    }
    // Hana: Only use the first sequence (should be <|model|>)
    // of the prompt before <|user|> (as KoboldAI Lite does it).
    if (isInstruct && isNotEmpty(power_user.instruct.input_sequence)) {
        if (getMessage.indexOf(power_user.instruct.input_sequence) != -1) {
            getMessage = getMessage.substring(0, getMessage.indexOf(power_user.instruct.input_sequence));
        }
    }

    // Remove instruct sequences leaking to the output
    if (isInstruct && power_user.instruct.sequences_as_stop_strings) {
        const sequences = [
            { value: power_user.instruct.input_sequence, apply: isImpersonate && isNotEmpty(power_user.instruct.input_sequence) },
            { value: power_user.instruct.output_sequence, apply: !isImpersonate && isNotEmpty(power_user.instruct.output_sequence) },
            { value: power_user.instruct.last_output_sequence, apply: !isImpersonate && isNotEmpty(power_user.instruct.last_output_sequence) },
        ];
        for (const seq of sequences.filter(s => s.apply)) {
            seq.value.split('\n').filter(line => line.trim() !== '').forEach(line => { getMessage = getMessage.replaceAll(line, ''); });
        }
    }

    // clean-up group message from excessive generations
    if (selected_group) {
        getMessage = cleanGroupMessage(getMessage);
    }

    if (!power_user.allow_name2_display) {
        const name2Escaped = escapeRegex(name2);
        getMessage = getMessage.replace(new RegExp(`(^|\n)${name2Escaped}:\\s*`, 'g'), '$1');
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (power_user.auto_fix_generated_markdown) {
        getMessage = fixMarkdown(getMessage, false);
    }

    if (trimNames) {
        // If this is an impersonation, trim "{{user}}:" from the beginning
        // If this isn't an impersonation, trim "{{char}}:" from the beginning.
        // Only applied when the corresponding "power_user.allow_nameX_display" is false.
        const nameToTrim2 = isImpersonate
            ? (!power_user.allow_name1_display ? name1 : '')  // user
            : (!power_user.allow_name2_display ? name2 : '');  // char

        if (nameToTrim2 && getMessage.startsWith(nameToTrim2 + ':')) {
            getMessage = getMessage.replace(nameToTrim2 + ':', '');
            getMessage = getMessage.trimStart();
        }
    }

    if (isImpersonate) {
        getMessage = getMessage.trim();
    }

    if (!displayIncompleteSentences && power_user.trim_sentences) {
        getMessage = trimToEndSentence(getMessage);
    }

    if (power_user.trim_spaces && !PromptReasoning.getLatestPrefix()) {
        getMessage = getMessage.trim();
    }

    return getMessage;
}
return cleanUpMessage(parameters);
}
