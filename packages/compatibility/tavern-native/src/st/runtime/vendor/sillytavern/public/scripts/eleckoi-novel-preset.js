// ST 1.19.0 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. Original NovelAI preset conversion.
const default_order = [1, 5, 0, 2, 3, 4];
const samplers = {
    temperature: 0,
    top_k: 1,
    top_p: 2,
    tfs: 3,
    top_a: 4,
    typical_p: 5,
    // removed samplers were here
    mirostat: 8,
    math1: 9,
    min_p: 10,
};
export function convertNovelPreset(data) {
    if (!data || typeof data !== 'object' || data.presetVersion !== 3 || !data.parameters || typeof data.parameters !== 'object') {
        return data;
    }

    return {
        max_context: 8000,
        temperature: data.parameters.temperature,
        max_length: data.parameters.max_length,
        min_length: data.parameters.min_length,
        top_k: data.parameters.top_k,
        top_p: data.parameters.top_p,
        top_a: data.parameters.top_a,
        typical_p: data.parameters.typical_p,
        tail_free_sampling: data.parameters.tail_free_sampling,
        repetition_penalty: data.parameters.repetition_penalty,
        repetition_penalty_range: data.parameters.repetition_penalty_range,
        repetition_penalty_slope: data.parameters.repetition_penalty_slope,
        repetition_penalty_frequency: data.parameters.repetition_penalty_frequency,
        repetition_penalty_presence: data.parameters.repetition_penalty_presence,
        phrase_rep_pen: data.parameters.phrase_rep_pen,
        mirostat_lr: data.parameters.mirostat_lr,
        mirostat_tau: data.parameters.mirostat_tau,
        math1_temp: data.parameters.math1_temp,
        math1_quad: data.parameters.math1_quad,
        math1_quad_entropy_scale: data.parameters.math1_quad_entropy_scale,
        min_p: data.parameters.min_p,
        order: Array.isArray(data.parameters.order) ? data.parameters.order.filter(s => s.enabled && Object.keys(samplers).includes(s.id)).map(s => samplers[s.id]) : default_order,
        extensions: {},
    };
}
