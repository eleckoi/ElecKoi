import { desktopClient } from "../../../bridge/desktopClient.ts";

export function getRegexRules(characterId) {
  return desktopClient.request("query.regex_rules.read", { characterId });
}

export function saveRegexRules(characterId, collection) {
  return desktopClient.request("command.regex_rules.save", {
    characterId,
    collection,
    expectedRevision: collection.revision,
  });
}

export function importRegexRules(characterId, collection, fallbackScope, documents) {
  return desktopClient.request("command.regex_rules.import", {
    characterId,
    fallbackScope,
    documents,
    expectedRevision: collection.revision,
  });
}

export function exportRegexRules(characterId, ruleIds) {
  return desktopClient.request("command.regex_rules.export", { characterId, ruleIds });
}

export function testRegexRule(text, rule, target) {
  return desktopClient.request("command.regex_rules.test", { text, rule, target });
}
