import { createContext, useContext } from "react";

const DisplayPreferencesContext = createContext(null);

export function DisplayPreferencesProvider({ model, children }) {
  return <DisplayPreferencesContext.Provider value={model || null}>{children}</DisplayPreferencesContext.Provider>;
}

export function useDshDisplayPreferences() {
  return useContext(DisplayPreferencesContext);
}
