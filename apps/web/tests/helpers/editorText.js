import { EditorView } from '@codemirror/view';

export function editorText(node) {
  if (node.matches('textarea,input')) return node.value;
  return EditorView.findFromDOM(node).state.doc.toString();
}
export function changeEditorText(node, value) {
  if (node.matches('textarea,input')) {
    Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const view = EditorView.findFromDOM(node);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }
}
export const switchIsOn = node => node.getAttribute('aria-checked') === 'true' || node.checked === true;

if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [];
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
