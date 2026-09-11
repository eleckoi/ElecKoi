export interface MessageDisplayCompatibility {
  prepareAssistantText(text: string, complete: boolean, displayRulePatterns: Iterable<string>): string
  resolveVariableMacros(text: string, variableStateJson: string): string
}
