import platform from './platform.ts';
export const settingsDataRoot=()=>platform.standardDataRoot();
export const defaultProjectsLocation=()=>platform.projectsRoot();
/** Pre-rename library. Read-only fallback so work created before the RUOK rename still opens. */
export const legacyProjectsLocation=()=>platform.legacyProjectsRoot();
