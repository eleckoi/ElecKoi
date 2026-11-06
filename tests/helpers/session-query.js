/** Query lease for fixtures that already own a detached, explicitly controlled inspection. */
export function queryFromInspection(inspect) {
  return {
    async observeSession(id) {
      const cut = await inspect(id)
      return { header: cut.meta, inheritedEventCount: cut.inheritedEventCount ?? 0, events: cut.events,
        [Symbol.dispose]() {} }
    }
  }
}
