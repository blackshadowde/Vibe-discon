// Central place for the details shown on the About page and the welcome tour.
// Edit the values below; empty values are hidden in the UI (nothing fake is shown).

export const APP_NAME = 'Vibe';
export const APP_VERSION = '2.0.0';

// Example: 'https://github.com/your-username/your-repo'. Leave '' to hide the GitHub row.
export const GITHUB_URL = 'https://github.com/blackshadowde';

// Shown in small monospace text under the GitHub link. Leave '' to hide.
export const GITHUB_OWNER = 'Ashish';

// People behind the project. Leave the array empty to hide the team section.
// Example: { name: 'Your Name', role: 'Creator' }
export const TEAM: { name: string; role?: string }[] = [
  { name: 'A.Gowthami', role: 'Support team' },
];

// Remembers (per device) that the welcome tour was already shown.
export const WELCOME_SEEN_KEY = 'vibe_welcome_seen_v1';
