import { DEFAULT_CHAT_DISPLAY_PREFERENCES, DEFAULT_CHAT_TEXT_COLORS, RICH_MESSAGE_FLOOR_RANGE } from '@shared/contracts/settings/schemas';
import { resolveChatDisplayProfile, resolveRoleplayStyle } from '../../appearance/index.js';

export const chatLayouts = [
  { id: 'roleplay', label: '角色扮演', disabled: false },
  { id: 'agent', label: 'Agent', disabled: false },
  { id: 'social', label: '社交软件', disabled: true },
];
export const avatarShapes = [
  { id: 'circle', label: '圆形' },
  { id: 'rounded_square', label: '圆角正方形' },
  { id: 'portrait', label: '圆角矩形' },
];
export const textColorOptions = [
  { key: 'italics', label: '斜体文本' },
  { key: 'underline', label: '下划线文本' },
  { key: 'quote', label: '引号内文本' },
];
export const richMessageFloorTuner = {
  ...RICH_MESSAGE_FLOOR_RANGE, label: '自动运行楼层数', step: 1, precision: 0, suffix: '楼',
};
export const richMessageLimitDescription = '按最近的 AI 消息计数，更早的富消息点击加载，最多额外运行一个旧楼层。重新加载可能重置卡片内部状态。';
export const chatDisplayTuners = {
  avatar_size: { label: '头像大小', min: 24, max: 96, step: 0.5, precision: 1 },
  name_font_size: { label: '名字大小', min: 10, max: 18, step: 0.5, precision: 1 },
  name_avatar_spacing: { label: '头像与名字间距', min: 0, max: 20, step: 1, precision: 0 },
  line_height_multiplier: { label: '行距', min: 0.8, max: 1.6, step: 0.05, precision: 2, suffix: '×' },
  letter_spacing: { label: '字距', min: -1, max: 4, step: 0.5, precision: 1 },
  paragraph_spacing: { label: '段距', min: 0, max: 24, step: 1, precision: 0 },
  reply_spacing: { label: '回复间距', min: 0, max: 32, step: 1, precision: 0 },
  turn_spacing: { label: '消息间距', min: 0, max: 32, step: 1, precision: 0 },
  bubble_corner_radius: { label: '圆角', min: 0, max: 24, step: 1, precision: 0 },
};

/** Both presentations update the same preference contract and active layout profile. */
export function chatDisplaySettings(chatDisplay, onChange) {
  const preferences = chatDisplay || DEFAULT_CHAT_DISPLAY_PREFERENCES;
  const { layout, profile } = resolveChatDisplayProfile(preferences);
  const roleplayStyle = resolveRoleplayStyle(preferences);
  const bubbleMode = layout === 'roleplay' && roleplayStyle.bubbles_enabled;
  const baseDefaults = DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles[layout];
  const defaults = bubbleMode ? { ...baseDefaults, turn_spacing: DEFAULT_CHAT_DISPLAY_PREFERENCES.roleplay_style.bubble_spacing } : baseDefaults;
  const updateProfile = patch => {
    if (!bubbleMode) return onChange({ ...preferences, profiles: { ...preferences.profiles, [layout]: { ...profile, ...patch } } });
    const { turn_spacing, ...rest } = patch;
    onChange({ ...preferences,
      profiles: { ...preferences.profiles, [layout]: { ...profile,
        turn_spacing: preferences.profiles?.[layout]?.turn_spacing ?? baseDefaults.turn_spacing, ...rest } },
      roleplay_style: { ...roleplayStyle, ...(turn_spacing === undefined ? {} : { bubble_spacing: turn_spacing }) },
    });
  };
  return {
    preferences, layout, profile, defaults, roleplayStyle,
    updateRoleplayStyle: patch => onChange({ ...preferences, roleplay_style: { ...roleplayStyle, ...patch } }),
    selectLayout(next) {
      if (!chatLayouts.some(item => item.id === next && !item.disabled)) return;
      onChange({ ...preferences, layout: next });
    },
    updateProfile,
    updatePreferences: patch => onChange({ ...preferences, ...patch }),
    resetProfile: () => onChange({ ...preferences,
      ...(layout === 'roleplay' ? { roleplay_style: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.roleplay_style } } : {}),
      profiles: { ...preferences.profiles, [layout]: { ...baseDefaults } } }),
    updateTextColor: (key, value) => onChange({ ...preferences, text_colors: { ...preferences.text_colors, [key]: value } }),
    resetTextColors: () => onChange({ ...preferences, text_colors: { ...DEFAULT_CHAT_TEXT_COLORS } }),
  };
}
