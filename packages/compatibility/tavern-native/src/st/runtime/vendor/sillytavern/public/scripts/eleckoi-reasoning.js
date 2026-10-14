// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original reasoning parsing and formatting.
import { power_user, substituteParams } from '../../../../tavern-runtime/host.js';
import { escapeRegex } from './utils.js';
export function trimSpaces(input) {
    if (!input || typeof input !== 'string') {
        return input;
    }
    return power_user.trim_spaces ? input.trim() : input;
}
export function removeReasoningFromString(str) {
    if (!power_user.reasoning.auto_parse) {
        return str;
    }

    const parsedReasoning = parseReasoningFromString(str);
    return parsedReasoning?.content ?? str;
}

export function parseReasoningFromString(str, { strict = true } = {}, template = null) {
    template = template ?? power_user.reasoning;  // if no template given, use the currently selected template

    // Both prefix and suffix must be defined
    if (!template.prefix || !template.suffix) {
        return null;
    }

    try {
        const regex = new RegExp(`${(strict ? '^\\s*?' : '')}${escapeRegex(template.prefix)}(.*?)${escapeRegex(template.suffix)}`, 's');

        let didReplace = false;
        let reasoning = '';
        let content = String(str).replace(regex, (_match, captureGroup) => {
            didReplace = true;
            reasoning = captureGroup;
            return '';
        });

        if (didReplace) {
            reasoning = trimSpaces(reasoning);
            content = trimSpaces(content);
        }

        return { reasoning, content };
    } catch (error) {
        console.error('[Reasoning] Error parsing reasoning block', error);
        return null;
    }
}

export function formatReasoning(reasoning, content, template = null) {
    template = template ?? power_user.reasoning;

    // If no reasoning provided, return content only
    if (!reasoning || !template.prefix || !template.suffix) {
        return { formatted: content, contentOnly: content };
    }

    // Substitute macros in template parts
    const prefix = substituteParams(template.prefix || '');
    const suffix = substituteParams(template.suffix || '');
    const separator = substituteParams(template.separator || '');

    // Build the formatted string: prefix + reasoning + suffix + separator + content
    const formatted = `${prefix}${reasoning}${suffix}${separator}${content}`;

    return { formatted, contentOnly: content };
}
