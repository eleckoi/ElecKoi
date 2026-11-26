export interface MessageDisplayCompatibility {
  resolveVariableMacros(text: string, variableStateJson: string, escape?: (value: string) => string, preserveReplyTags?: boolean): string
}
