import { createContext, useContext } from 'react';

const defaults = {
  render: (_name, _owner, fallback) => fallback,
  actions: () => null,
};

export const CatalogSlotsContext = createContext(null);

export function useCatalogSlots() {
  return useContext(CatalogSlotsContext) ?? defaults;
}
