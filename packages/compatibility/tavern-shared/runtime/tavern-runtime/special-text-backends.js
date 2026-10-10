import {getBadWordsList,getLogitBiasList,getRepPenaltyWhitelist} from '../vendor/sillytavern/public/scripts/eleckoi-novel-defaults.js';

// These protocols share the existing text formatter and native HTTP/cancellation service.
export function specialTextRequest(type,body) {
  if(type === 'novel') {
    const model=body.model;
    const parameters={...(body.parameters || {}),use_string:body.use_string ?? true};
    for(const name of ['temperature','min_length','tail_free_sampling','repetition_penalty','repetition_penalty_range','repetition_penalty_slope',
      'repetition_penalty_frequency','repetition_penalty_presence','top_a','top_p','top_k','typical_p','mirostat_lr','mirostat_tau','phrase_rep_pen',
      'generate_until_sentence','use_cache','return_full_text','prefix','order','num_logprobs','min_p','math1_temp','math1_quad','math1_quad_entropy_scale']) {
      if(body[name] !== undefined)parameters[name]=body[name];
    }
    parameters.max_length=body.max_length ?? body.max_tokens;
    if(parameters.tail_free_sampling === undefined && body.tfs !== undefined)parameters.tail_free_sampling=body.tfs;
    parameters.stop_sequences=body.stop_sequences ?? body.stop;
    parameters.bad_words_ids=[...getBadWordsList(model),...(body.bad_words_ids || [])].filter(value=>value.length);
    parameters.logit_bias_exp=[...getLogitBiasList(model),...(body.logit_bias_exp || [])];
    parameters.repetition_penalty_whitelist=body.repetition_penalty_whitelist ?? getRepPenaltyWhitelist(model);
    if(parameters.prefix === 'theme_textadventure') {
      if(/clio|kayra/.test(model))parameters.eos_token_id=49405;
      if(model.includes('erato'))parameters.eos_token_id=29;
    }
    return {input:body.input ?? body.prompt,model,parameters};
  }
  if(type === 'horde') {
    const params={...body};
    for(const name of ['prompt','model','models','stream','trusted_workers','horde_settings'])delete params[name];
    params.max_length=params.max_length ?? params.max_tokens;delete params.max_tokens;
    params.max_context_length=params.max_context_length ?? params.max_context;delete params.max_context;
    params.n=body.n ?? 1;
    for(const name of ['frmtadsnsp','frmtrmblln','frmtrmspch','frmttriminc'])params[name]=body[name] ?? false;
    const settings=body.horde_settings || {};
    return {prompt:body.prompt,params,models:body.models ?? settings.models ?? (body.model ? [body.model] : []),
      trusted_workers:body.trusted_workers ?? settings.trusted_workers_only ?? false};
  }
  return body;
}
