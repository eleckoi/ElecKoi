/** Default selection uses the saved connection's own native model catalog. */
export function configuredConnectionModel(table, id, requestedModel) {
  if (requestedModel) return requestedModel;
  const entry = table.find(row => row.ns === 'eleckoi-client-models')?.value?.entries?.[id];
  const profile = table.find(row => row.ns === 'llm-pi-ai')?.value?.providers?.[id];
  return entry?.model || profile?.models?.[0]?.id || '';
}

/** Dedicated providers own their official catalog even without a saved Client entry. */
export async function resolveConfiguredConnectionModel(table, id, requestedModel, listModels, defaultSelection = () => undefined) {
  const saved = configuredConnectionModel(table, id, requestedModel);
  if (saved) return saved;
  const selection = defaultSelection();
  if (selection?.provider === id && selection.model) return selection.model;
  return (await listModels(id))[0]?.id || '';
}
