(function connectSharedFrame(global) {
  'use strict';
  const shared = global.parent.__ElecKoiShared;
  if (!shared || global.parent === global) throw new Error('Plugin frame needs the ElecKoi shared host');
  if (global.parent === global.top) shared.connect(global.name, global);
  else shared.adopt(global, global.parent.__ElecKoiPluginId || 'frontend');
})(globalThis);
