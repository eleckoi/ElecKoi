// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original story-string rendering and validation.
import { power_user, substituteParams, accountStorage, extension_prompt_types } from '../../../../tavern-runtime/host.js';
import { Handlebars } from '../../../../tavern-runtime/libraries.js';
import { getStringHash } from './utils.js';
const storage_keys={storyStringValidationCache:'storyStringValidationCache'};
export function renderStoryString(params, { customStoryString = null, customInstructSettings = null, customContextSettings = null } = {}) {
    try {
        const instructSettings = structuredClone(customInstructSettings ?? power_user.instruct);
        const contextSettings = structuredClone(customContextSettings ?? power_user.context);
        const storyString = customStoryString ?? contextSettings.story_string;
        const storyStringPosition = contextSettings.story_string_position ?? extension_prompt_types.IN_PROMPT;

        // Validate and log possible warnings/errors
        validateStoryString(storyString, params);

        // compile the story string template into a function, with no HTML escaping
        const compiledTemplate = Handlebars.compile(storyString, { noEscape: true });

        // render the story string template with the given params
        let output = compiledTemplate(params);

        // substitute {{macro}} params that are not defined in the story string
        output = substituteParams(output, params.user, params.char);

        // remove leading newlines
        output = output.replace(/^\n+/, '');

        // add a newline to the end of the story string if it doesn't have one
        if (output.length > 0 && !output.endsWith('\n') && storyStringPosition !== extension_prompt_types.IN_CHAT) {
            if (!instructSettings.enabled || (instructSettings.wrap && !instructSettings.story_string_suffix)) {
                output += '\n';
            }
        }

        return output;
    } catch (e) {
        toastr.error('Check the story string template for validity', 'Error rendering story string');
        console.error('Error rendering story string', e);
        throw e; // rethrow the error
    }
}

function validateStoryString(storyString, params) {
    /** @type {{hashCache: {[hash: string]: {fieldsWarned: {[key: string]: boolean}}}}} */
    const cache = JSON.parse(accountStorage.getItem(storage_keys.storyStringValidationCache)) ?? { hashCache: {} };

    const hash = getStringHash(storyString);

    // Initialize the cache for the current hash if it doesn't exist
    if (!cache.hashCache[hash]) {
        cache.hashCache[hash] = { fieldsWarned: {} };
    }

    const currentCache = cache.hashCache[hash];
    const fieldsToWarn = [];

    function validateMissingField(field, fallbackLegacyField = null) {
        const contains = storyString.includes(`{{${field}}}`) || (!!fallbackLegacyField && storyString.includes(`{{${fallbackLegacyField}}}`));
        if (!contains && params[field]) {
            const wasLogged = currentCache.fieldsWarned[field];
            if (!wasLogged) {
                fieldsToWarn.push(field);
                currentCache.fieldsWarned[field] = true;
            }
            console.warn(`The story string does not contain {{${field}}}, but it would contain content:\n`, params[field]);
        }
    }

    validateMissingField('description');
    validateMissingField('personality');
    validateMissingField('persona');
    validateMissingField('scenario');
    // validateMissingField('system');
    validateMissingField('wiBefore', 'loreBefore');
    validateMissingField('wiAfter', 'loreAfter');

    if (fieldsToWarn.length > 0) {
        const fieldsList = fieldsToWarn.map(field => `{{${field}}}`).join(', ');
        toastr.warning(`The story string does not contain the following fields, but they would contain content: ${fieldsList}`, 'Story String Validation');
    }

    accountStorage.setItem(storage_keys.storyStringValidationCache, JSON.stringify(cache));
}
