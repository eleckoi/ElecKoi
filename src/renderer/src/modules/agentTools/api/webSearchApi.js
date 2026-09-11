import { desktopClient } from '../../../bridge/desktopClient.ts';

export function loadWebSearchSettings() {
  return desktopClient.request('query.agent_tools.web_search.settings', {});
}

export function updateWebSearchSettings(settings) {
  return desktopClient.request('command.agent_tools.web_search.update', settings);
}

export function saveAndTestTavilyApiKey(apiKey) {
  return desktopClient.request('command.agent_tools.web_search.tavily.save_and_test', { apiKey });
}

export function testTavilyConnection(apiKey = '') {
  return desktopClient.request('command.agent_tools.web_search.tavily.test', apiKey.trim() ? { apiKey } : {});
}

export function removeTavilyApiKey() {
  return desktopClient.request('command.agent_tools.web_search.tavily.remove', {});
}

