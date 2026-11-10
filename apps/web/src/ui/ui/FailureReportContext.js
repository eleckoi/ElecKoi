import { createContext } from 'react';

/** The window's existing report preview; absent when no platform report bridge is available. */
export const FailureReportContext = createContext(null);
