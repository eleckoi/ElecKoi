import { describe, expect, it } from 'vitest';
import { referencedEjsTitles } from '../src/renderer/src/modules/settingLibraries/components/SettingLibraryEntryEditor.jsx';

describe('setting-library EJS editor', () => {
  it('recognizes both Android getwi call forms', () => {
    const titles = referencedEjsTitles(`
      <%- await getwi(null, "第一章") %>
      <%- await getwi('第二章') %>
    `);
    expect([...titles]).toEqual(['第一章', '第二章']);
  });
});
