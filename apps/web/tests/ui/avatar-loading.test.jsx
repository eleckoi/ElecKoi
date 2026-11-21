// @vitest-environment jsdom
import React, { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Avatar } from '../../src/ui/ui/Avatar.jsx';
import { CharacterContactRow } from '../../src/modules/persona/components/CharacterContactRow.jsx';
import { usePersonaCharacters } from '../../src/modules/persona/hooks/usePersonaCharacters.js';
import { coverSources } from '../../src/app/services/assets.js';
globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; document.body.replaceChildren(); delete document.documentElement.dataset.eleckoiMobile; vi.restoreAllMocks(); });
const source = `eleckoi-media://asset/v1/${'a'.repeat(64)}/portrait/${'b'.repeat(64)}.png`;
it.each([false, true])('selects cover resolutions by long edge and pixel density on mobile=%s', mobile => {
  if (mobile) document.documentElement.dataset.eleckoiMobile = 'true';
  const sources = coverSources(source, 190, 0.68);
  const reference = url => mobile ? new URL(url).searchParams.get('reference') : url;
  expect(reference(sources.src)).toBe(source + '?thumbnail=512');
  expect(sources.srcSet.split(', ').map(entry => reference(entry.split(' ')[0]))).toEqual([
    source + '?thumbnail=512', source + '?thumbnail=1024', source + '?thumbnail=1024',
  ]);
  const large = coverSources(source, 900, 0.75);
  expect(reference(large.src)).toBe(source + '?thumbnail=2048');
  expect(large.srcSet.split(', ').map(entry => reference(entry.split(' ')[0]))).toEqual([source + '?thumbnail=2048', source, source]);
  expect(coverSources('https://example.test/original.png', 190, 0.68)).toEqual({ src: 'https://example.test/original.png' });
});
async function render(content) {
  if (!root) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  await act(async () => root.render(content));
}
it('uses the stored square artwork for PC character rows and keeps older avatars and covers usable', async () => {
  const square = 'https://example.test/square.png';
  const circle = 'https://example.test/circle.png';
  const cover = 'https://example.test/cover.png';
  const showRows = (artworkMode, variants) => render(<>{variants.map((persona, index) =>
    <CharacterContactRow key={index} character={{ id: String(index), persona }} artworkMode={artworkMode} />
  )}</>);
  const imageSources = () => [...document.querySelectorAll('.sidebar-character-artwork img')].map(image => image.src);
  const variants = [
    { assistant_square: square, assistant_avatar: circle, assistant_cover: cover },
    { assistant_avatar: circle, assistant_cover: cover },
    { assistant_cover: cover },
  ];
  await showRows('square', variants);
  expect(imageSources()).toEqual([square, circle, cover]);
  await showRows('avatar', variants);
  expect(imageSources()).toEqual([circle, circle]);
});
it.each([false, true])('uses browser-selected thumbnail densities on mobile=%s and falls back to original only on failure', async mobile => {
  if (mobile) document.documentElement.dataset.eleckoiMobile = 'true';
  await render(<Avatar src={source} name="Sample" />);
  const image = document.querySelector('img');
  const reference = url => mobile ? new URL(url).searchParams.get('reference') : url;
  expect(reference(image.src)).toBe(source + '?thumbnail=256');
  expect(image.srcset).toContain('512'); expect(image.getAttribute('decoding')).toBe('async');
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(document.querySelector('img')).toBe(image); expect(reference(image.src)).toBe(source); expect(image.srcset).toBe('');
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(document.querySelector('img')).toBeNull(); expect(document.querySelector('.avatar').textContent).toBe('S');
  await render(<Avatar src={source.replace('portrait', 'square')} name="Next" />);
  expect(document.querySelector('img')).not.toBeNull(); expect(document.querySelector('img').srcset).toContain('512');
});
it('renders cached user profile images in the first commit instead of a blank profile', async () => {
  const snapshot = { status: 'ready', profile: { user_name: 'Sample', user_avatar: source, user_portrait: source } };
  const getSnapshot = vi.fn(() => snapshot), commits = [];
  const model = { subscribe: () => () => {}, getSnapshot };
  function Probe() {
    const { persona } = usePersonaCharacters({ personaModel: model });
    useLayoutEffect(() => { commits.push(persona.user_avatar); });
    return <Avatar src={persona.user_avatar} />;
  }
  await render(<Probe />);
  expect(commits[0]).toBe(source); expect(commits.every(value => value === source)).toBe(true);
});
