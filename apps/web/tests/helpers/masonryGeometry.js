// jsdom has no layout engine. Model a bounded viewport for interaction tests;
// real responsive card geometry and virtualization are checked in Electron.
import { beforeEach, vi } from 'vitest';
const bounds = Element.prototype.getBoundingClientRect, computed = window.getComputedStyle.bind(window);
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const isViewport = node => node.classList?.contains('mobile-character-list') || node.classList?.contains('character-manager-scroll');
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.hasAttribute('data-virtual-masonry') || isViewport(this) || this.hasAttribute('data-masonry-id')) {
      const mobile = this.classList.contains('mobile-character-grid') || this.closest('.mobile-character-list');
      const width = this.hasAttribute('data-masonry-id') ? parseFloat(this.style.width) : mobile ? 320 : 720;
      const height = this.hasAttribute('data-masonry-id') ? 400 : isViewport(this) ? 640 : parseFloat(this.style.height) || 0;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} };
    }
    return bounds.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return isViewport(this) ? 640 : this.hasAttribute('data-masonry-id') ? 400 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return isViewport(this) ? this.classList.contains('mobile-character-list') ? 320 : 720 : 0; });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
    const style = computed(node, pseudo);
    if (!node.hasAttribute('data-virtual-masonry')) return style;
    return new Proxy(style, { get(target, property) {
      if (property === 'gridTemplateColumns') return node.classList.contains('mobile-character-grid') ? '158px 158px' : '177px 177px 177px 177px';
      if (property === 'columnGap' || property === 'rowGap') return '4px';
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
});
