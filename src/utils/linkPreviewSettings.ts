/**
 * Settings storage and event dispatching for URL link previews.
 */
import {
  getLinkPreviewsEnabled,
  setLinkPreviewsEnabled as setPrivacyLinkPreviewsEnabled,
  LINK_PREVIEWS_CHANGED_EVENT,
} from './privacySettings';

const KEY_ENCRYPTED_LINK_PREVIEWS = 'matrix_encrypted_link_previews_enabled';
export const EVENT_LINK_PREVIEW_SETTINGS = 'matrix_link_previews_settings_updated';

export function isLinkPreviewsEnabled(): boolean {
  return getLinkPreviewsEnabled();
}

export function setLinkPreviewsEnabled(enabled: boolean): void {
  setPrivacyLinkPreviewsEnabled(enabled);
  window.dispatchEvent(new Event(EVENT_LINK_PREVIEW_SETTINGS));
}

export function isEncryptedLinkPreviewsEnabled(): boolean {
  return localStorage.getItem(KEY_ENCRYPTED_LINK_PREVIEWS) === 'true';
}

export function setEncryptedLinkPreviewsEnabled(enabled: boolean): void {
  localStorage.setItem(KEY_ENCRYPTED_LINK_PREVIEWS, String(enabled));
  window.dispatchEvent(new Event(EVENT_LINK_PREVIEW_SETTINGS));
}
