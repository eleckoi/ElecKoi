package com.eleckoi.android.compatibility.mvu.display

/**
 * Installs the smallest interactive surface required by imported card frontends. The adapter
 * delegates to ElecKoi's permission-checked Author SDK and never interprets arbitrary commands.
 */
internal fun String.injectMvuFrontendActionBridge(): String {
    if (MvuFrontendActionBridgeMarker in this || !referencesSupportedFrontendActions()) return this

    val bridge = mvuFrontendActionBridge()
    val head = ActionBridgeHtmlHeadOpen.find(this)
    if (head == null) return bridge + this
    val insertionPoint = head.range.last + 1
    return substring(0, insertionPoint) + bridge + substring(insertionPoint)
}

private fun String.referencesSupportedFrontendActions(): Boolean {
    if (!contains("<script", ignoreCase = true)) return false
    return contains("triggerSlash") || contains("setChatMessages")
}

private fun mvuFrontendActionBridge(): String = """
<script id="$MvuFrontendActionBridgeMarker">
((global) => {
  'use strict';

  if (global.__ElecKoiMvuActionBridge) return;

  const requireSdk = () => {
    const sdk = global.ElecKoi;
    if (!sdk?.chat?.send || !sdk?.openings?.list || !sdk?.openings?.select) {
      throw new Error('ElecKoi card actions are unavailable');
    }
    return sdk;
  };

  const setOpeningFromMessageUpdate = async (chatMessages) => {
    if (!Array.isArray(chatMessages) || chatMessages.length !== 1) {
      throw new TypeError('ElecKoi supports one opening switch at a time');
    }
    const update = chatMessages[0];
    if (!update || typeof update !== 'object') {
      throw new TypeError('setChatMessages requires a message update object');
    }
    const supportedKeys = new Set(['message_id', 'swipe_id']);
    if (Object.keys(update).some((key) => !supportedKeys.has(key))) {
      throw new Error('ElecKoi only supports opening switches through setChatMessages');
    }
    const messageId = Number(update.message_id);
    const swipeId = Number(update.swipe_id);
    if (messageId !== 0 || !Number.isInteger(swipeId) || swipeId < 0) {
      throw new RangeError('Opening switches require message_id 0 and a non-negative swipe_id');
    }
    const sdk = requireSdk();
    const openings = await sdk.openings.list();
    const option = openings?.items?.[swipeId];
    if (!option?.id) throw new RangeError('The requested opening does not exist');
    return sdk.openings.select(option.id);
  };

  const sendAndTrigger = async (command) => {
    const value = String(command ?? '').trim();
    const prefix = '/send ';
    const suffix = '|/trigger';
    if (!value.startsWith(prefix) || !value.endsWith(suffix)) {
      throw new Error('ElecKoi only supports the /send ...|/trigger card action');
    }
    const text = value.slice(prefix.length, value.length - suffix.length).trim();
    if (!text) throw new TypeError('The card action cannot send an empty message');
    return requireSdk().chat.send(text);
  };

  const exposeFunction = (name, action) => {
    if (typeof global[name] === 'function') return;
    Object.defineProperty(global, name, {
      value: action,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  };
  exposeFunction('setChatMessages', setOpeningFromMessageUpdate);
  exposeFunction('triggerSlash', sendAndTrigger);

  if (!global.TavernHelper) {
    Object.defineProperty(global, 'TavernHelper', {
      value: Object.freeze({
        setChatMessages: setOpeningFromMessageUpdate,
        triggerSlash: sendAndTrigger,
      }),
      configurable: true,
      enumerable: true,
      writable: false,
    });
  }

  Object.defineProperty(global, '__ElecKoiMvuActionBridge', {
    value: Object.freeze({ version: 1, commands: Object.freeze(['/send ...|/trigger']) }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
})(window);
</script>
""".trimIndent()

internal const val MvuFrontendActionBridgeMarker = "eleckoi-mvu-action-bridge"

private val ActionBridgeHtmlHeadOpen = Regex("""(?i)<head(?:\s[^>]*)?>""")
