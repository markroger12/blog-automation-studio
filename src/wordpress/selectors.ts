/** Versioned, prioritized selectors with fallbacks. Users may override via settings.advanced.selectorOverrides. */
export const SELECTORS_VERSION = 1;

export const SELECTORS = {
  loginForm: ['#loginform', 'form[name="loginform"]'],
  adminBar: ['#wpadminbar', '#adminmenu'],
  gutenbergRoot: ['.block-editor', '.edit-post-layout', '.editor-editor-interface'],
  classicEditor: ['#post #titlewrap', '#postdivrich'],
  gutenbergTitle: ['.editor-post-title__input', 'h1.wp-block-post-title', '[aria-label="Add title"]', '[aria-label="Titel hinzufügen"]'],
  classicTitle: ['#title'],
  classicContentTextTab: ['#content-html'],
  classicContent: ['#content'],
  classicSaveDraft: ['#save-post'],
  welcomeGuideClose: ['.edit-post-welcome-guide button[aria-label="Close"]', '.components-modal__header button[aria-label="Close"]', '.components-modal__header button[aria-label="Schließen"]'],
  hostOverlays: ['#hostinger-onboarding', '.hts-onboarding-modal', '.hostinger-modal', '#hostinger-tools-notice'],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

export function selectorsFor(key: SelectorKey, overrides: Record<string, string[]> = {}): string[] {
  return [...(overrides[key] ?? []), ...SELECTORS[key]];
}
