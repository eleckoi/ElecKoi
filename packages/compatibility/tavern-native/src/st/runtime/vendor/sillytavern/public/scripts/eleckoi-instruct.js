// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0.
import { power_user, selected_group, name1, name2, substituteParams, extension_prompt_types } from '../../../../tavern-runtime/host.js';
const onlyUnique = (value, index, array) => array.indexOf(value) === index;
export const names_behavior_types = {
    NONE: 'none',
    FORCE: 'force',
    ALWAYS: 'always',
};

export function getInstructStoppingSequences({ customInstruct = null, useStopStrings = null } = {}) {
    const instruct = structuredClone(customInstruct ?? power_user.instruct);

    /**
     * Adds instruct mode sequence to the result array.
     * @param {string} sequence Sequence string.
     * @returns {void}
     */
    function addInstructSequence(sequence) {
        // Cohee: oobabooga's textgen always appends newline before the sequence as a stopping string
        // But it's a problem for Metharme which doesn't use newlines to separate them.
        const wrap = (s) => instruct.wrap ? '\n' + s : s;
        // Sequence must be a non-empty string
        if (typeof sequence === 'string' && sequence.length > 0) {
            // If sequence is just a whitespace or newline - we don't want to make it a stopping string
            // User can always add it as a custom stop string if really needed
            if (sequence.trim().length > 0) {
                const wrappedSequence = wrap(sequence);
                // Need to respect "insert macro" setting
                const stopString = instruct.macro ? substituteParams(wrappedSequence) : wrappedSequence;
                result.push(stopString);
            }
        }
    }

    const result = [];

    // Since preset's don't have "enabled", we assume it's always enabled
    if (customInstruct ?? instruct.enabled) {
        const stop_sequence = instruct.stop_sequence || '';
        const input_sequence = instruct.input_sequence?.replace(/{{name}}/gi, name1) || '';
        const output_sequence = instruct.output_sequence?.replace(/{{name}}/gi, name2) || '';
        const first_output_sequence = instruct.first_output_sequence?.replace(/{{name}}/gi, name2) || '';
        const last_output_sequence = instruct.last_output_sequence?.replace(/{{name}}/gi, name2) || '';
        const system_sequence = instruct.system_sequence?.replace(/{{name}}/gi, 'System') || '';
        const last_system_sequence = instruct.last_system_sequence?.replace(/{{name}}/gi, 'System') || '';

        const combined_sequence = [
            stop_sequence,
        ];

        if (instruct.sequences_as_stop_strings) {
            combined_sequence.push(
                input_sequence,
                output_sequence,
                first_output_sequence,
                last_output_sequence,
                system_sequence,
                last_system_sequence,
            );
        }

        combined_sequence.join('\n').split('\n').filter(onlyUnique).forEach(addInstructSequence);
    }

    if (useStopStrings ?? power_user.context.use_stop_strings) {
        if (power_user.context.chat_start) {
            result.push(`\n${substituteParams(power_user.context.chat_start)}`);
        }

        if (power_user.context.example_separator) {
            result.push(`\n${substituteParams(power_user.context.example_separator)}`);
        }
    }

    return result;
}

export const force_output_sequence = {
    FIRST: 1,
    LAST: 2,
};

export function formatInstructModeChat(name, mes, isUser, isNarrator, forceAvatar, name1, name2, forceOutputSequence, customInstruct = null) {
    const instruct = structuredClone(customInstruct ?? power_user.instruct);
    let includeNames = isNarrator ? false : instruct.names_behavior === names_behavior_types.ALWAYS;

    if (!isNarrator && instruct.names_behavior === names_behavior_types.FORCE && ((selected_group && name !== name1) || (forceAvatar && name !== name1))) {
        includeNames = true;
    }

    function getPrefix() {
        if (isNarrator) {
            return instruct.system_same_as_user ? instruct.input_sequence : instruct.system_sequence;
        }

        if (isUser) {
            if (forceOutputSequence === force_output_sequence.FIRST) {
                return instruct.first_input_sequence || instruct.input_sequence;
            }

            if (forceOutputSequence === force_output_sequence.LAST) {
                return instruct.last_input_sequence || instruct.input_sequence;
            }

            return instruct.input_sequence;
        }

        if (forceOutputSequence === force_output_sequence.FIRST) {
            return instruct.first_output_sequence || instruct.output_sequence;
        }

        if (forceOutputSequence === force_output_sequence.LAST) {
            return instruct.last_output_sequence || instruct.output_sequence;
        }

        return instruct.output_sequence;
    }

    function getSuffix() {
        if (isNarrator) {
            return instruct.system_same_as_user ? instruct.input_suffix : instruct.system_suffix;
        }

        if (isUser) {
            return instruct.input_suffix;
        }

        return instruct.output_suffix;
    }

    let prefix = getPrefix() || '';
    let suffix = getSuffix() || '';

    if (instruct.macro) {
        prefix = substituteParams(prefix, { name1Override: name1, name2Override: name2 });
        prefix = prefix.replace(/{{name}}/gi, name || 'System');

        suffix = substituteParams(suffix, { name1Override: name1, name2Override: name2 });
        suffix = suffix.replace(/{{name}}/gi, name || 'System');
    }

    if (!suffix && instruct.wrap) {
        suffix = '\n';
    }

    const separator = instruct.wrap ? '\n' : '';

    // Don't include the name if it's empty
    const textArray = includeNames && name ? [prefix, `${name}: ${mes}` + suffix] : [prefix, mes + suffix];
    const text = textArray.filter(x => x).join(separator);

    return text;
}

export function formatInstructModeStoryString(storyString, { customContext = null, customInstruct = null } = {}) {
    if (!storyString) {
        return '';
    }

    const instructSettings = structuredClone(customInstruct ?? power_user.instruct);
    const contextSettings = structuredClone(customContext ?? power_user.context);
    const storyStringPosition = contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;

    // Only wrap if not in-chat position (it will be wrapped by message sequences instead)
    const applySequences = storyStringPosition !== extension_prompt_types.IN_CHAT;
    const separator = instructSettings.wrap ? '\n' : '';
    if (applySequences && instructSettings.story_string_prefix) {
        // TODO: Replace with a proper 'System' prompt entity name input
        const prefix = substituteParams(instructSettings.story_string_prefix).replace(/{{name}}/gi, 'System');
        storyString = prefix + separator + storyString;
    }

    if (applySequences && instructSettings.story_string_suffix) {
        const suffix = substituteParams(instructSettings.story_string_suffix);
        storyString = storyString + suffix;
    }

    return storyString;
}

export function formatInstructModePrompt(name, isImpersonate, promptBias, name1, name2, isQuiet, isQuietToLoud, customInstruct = null) {
    const instruct = structuredClone(customInstruct ?? power_user.instruct);
    const includeNames = name && (instruct.names_behavior === names_behavior_types.ALWAYS || (!!selected_group && instruct.names_behavior === names_behavior_types.FORCE)) && !(isQuiet && !isQuietToLoud);

    function getSequence() {
        // User impersonation prompt
        if (isImpersonate) {
            return instruct.last_input_sequence || instruct.input_sequence;
        }

        // Neutral / system / quiet prompt
        // Use a special quiet instruct sequence if defined, or assistant's output sequence otherwise
        if (isQuiet && !isQuietToLoud) {
            return instruct.last_system_sequence || instruct.output_sequence;
        }

        // Quiet in-character prompt
        if (isQuiet && isQuietToLoud) {
            return instruct.last_output_sequence || instruct.output_sequence;
        }

        // Default AI response
        return instruct.last_output_sequence || instruct.output_sequence;
    }

    let sequence = getSequence() || '';
    let nameFiller = '';

    // A hack for Mistral's formatting that has a normal output sequence ending with a space
    if (
        includeNames &&
        instruct.last_output_sequence &&
        instruct.output_sequence &&
        sequence === instruct.last_output_sequence &&
        /\s$/.test(instruct.output_sequence) &&
        !/\s$/.test(instruct.last_output_sequence)
    ) {
        nameFiller = instruct.output_sequence.slice(-1);
    }

    if (instruct.macro) {
        sequence = substituteParams(sequence, { name1Override: name1, name2Override: name2 });
        sequence = sequence.replace(/{{name}}/gi, name || 'System');
    }

    const separator = instruct.wrap ? '\n' : '';
    let text = includeNames ? (separator + sequence + separator + nameFiller + `${name}:`) : (separator + sequence);

    // Quiet prompt already has a newline at the end
    if (isQuiet && separator) {
        text = text.slice(separator.length);
    }

    if (!isImpersonate && promptBias) {
        text += (includeNames ? promptBias : (separator + promptBias.trimStart()));
    }

    return (instruct.wrap ? text.trimEnd() : text) + (includeNames ? '' : separator);
}
