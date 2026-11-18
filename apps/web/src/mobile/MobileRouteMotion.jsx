import { useLayoutEffect, useRef } from 'react';

function mainPanel(seat) {
  // AppFrame's main panel is immediately before the official rightbar column.
  const rightbar = seat.current?.querySelector(':scope > * > [data-rightbar-col]');
  return rightbar?.previousElementSibling?.firstElementChild;
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function settingsDepth(page) {
  if (page === 'home') return 0;
  return page.startsWith('chat:') ? 2 : 1;
}

function routeDirection(previous, routes, settingsPage) {
  if (previous.routes === routes) {
    return Math.sign(settingsDepth(settingsPage) - settingsDepth(previous.settingsPage));
  }
  const shared = routes.length > previous.routes.length ? previous.routes : routes;
  const longer = shared === routes ? previous.routes : routes;
  return shared.every((route, index) => route === longer[index])
    ? Math.sign(routes.length - previous.routes.length) : 0;
}

/** Runs after the existing AppFrame commits its destination inside Suspense. */
export function MobileRouteMotion({ seat, routes, panel, settingsPage, drawerOpen, searchOpen, routeBusy, isRootTab }) {
  const previous = useRef(null);
  const motion = useRef(null);

  useLayoutEffect(() => () => motion.current?.cancel(), []);
  useLayoutEffect(() => {
    // External panel selection can arrive before MobileWindow reconciles its stack.
    if (routes.at(-1).panel !== panel) return;

    const from = previous.current;
    previous.current = { routes, settingsPage, drawerOpen, searchOpen, isRootTab };
    const changed = from && (from.routes !== routes || from.settingsPage !== settingsPage);
    if (!changed && !drawerOpen && !searchOpen) return;
    motion.current?.cancel();
    motion.current = null;
    if (!changed || from.drawerOpen || drawerOpen || from.searchOpen || searchOpen || routeBusy || reducedMotion()) return;

    const content = mainPanel(seat);
    if (from.isRootTab && isRootTab) {
      if (from.routes.at(-1).panel !== panel) {
        motion.current = content?.animate?.([{ opacity: .94 }, { opacity: 1 }], { duration: 90, easing: 'ease-out' });
      }
      return;
    }

    const direction = routeDirection(from, routes, settingsPage);
    if (direction > 0 && routes.at(-1).kind === 'conversation') {
      motion.current = content?.animate?.([{ transform: 'translateX(16px)' }, { transform: 'translateX(0)' }], {
        duration: 180, easing: 'cubic-bezier(.2, 0, 0, 1)',
      });
      return;
    }
    const offset = direction * 32;
    const frames = direction
      ? [{ transform: 'translateX(' + offset + 'px)', opacity: .88 }, { transform: 'translateX(0)', opacity: 1 }]
      : [{ opacity: .78 }, { opacity: 1 }];
    motion.current = content?.animate?.(frames, {
      duration: direction > 0 ? 250 : direction < 0 ? 220 : 150,
      easing: 'cubic-bezier(.2, 0, 0, 1)',
    });
  }, [seat, routes, panel, settingsPage, drawerOpen, searchOpen, routeBusy, isRootTab]);

  return null;
}
