import React from 'react';
import { APP_NAME, APP_VERSION, GITHUB_URL, GITHUB_OWNER, TEAM } from '../appInfo';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the welcome tour again (how Vibe keeps you safe). */
  onReplayWelcome?: () => void;
  themeMode?: 'dark' | 'light';
}

const P = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  open: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  chevron: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
};

const Svg: React.FC<{ d: string; size?: number }> = ({ d, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

const CSS = `
.ab-root{--ab-bg:#1b1c20;--ab-surface:#2b2d31;--ab-outline:#3f4147;--ab-on:#ffffff;--ab-var:#b5bac1;--ab-container:rgba(88,101,242,.2);--ab-on-container:#c9cfff;
--m3-emph-dec:cubic-bezier(.05,.7,.1,1);
position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;background:var(--ab-bg);color:var(--ab-on);font-family:"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;
padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);animation:ab-in 380ms var(--m3-emph-dec) both}
.ab-root.ab-light{--ab-bg:#ffffff;--ab-surface:#f1f5f9;--ab-outline:#e2e8f0;--ab-on:#0f172a;--ab-var:#64748b;--ab-container:rgba(88,101,242,.14);--ab-on-container:#3f4bd1}
.ab-bar{display:flex;align-items:center;gap:8px;padding:0 12px;height:56px;flex:none}
.ab-back{width:48px;height:48px;border-radius:50%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ab-back:hover{background:rgba(128,128,128,.15)}.ab-back:active{background:rgba(128,128,128,.25)}
.ab-bar h1{margin:0;font-size:22px;line-height:28px;font-weight:600}
.ab-scroll{flex:1;overflow-y:auto;padding:0 20px 32px}
.ab-col{max-width:560px;margin:0 auto}
.ab-hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:16px 0 24px;animation:ab-rise 450ms var(--m3-emph-dec) 80ms both}
.ab-icon{width:96px;height:96px;border-radius:28px;box-shadow:0 8px 24px rgba(0,0,0,.35);object-fit:cover}
.ab-name{margin:16px 0 0;font-size:28px;line-height:36px;font-weight:700}
.ab-chip{margin-top:8px;display:inline-flex;border-radius:999px;background:var(--ab-container);color:var(--ab-on-container);font-size:12px;font-weight:600;padding:4px 12px}
.ab-desc{margin:16px 0 0;max-width:340px;font-size:14px;line-height:22px;color:var(--ab-var)}
.ab-list{display:flex;flex-direction:column;gap:12px}
.ab-card{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;text-align:left;font:inherit;color:inherit;text-decoration:none;background:var(--ab-surface);border:1px solid var(--ab-outline);border-radius:24px;padding:16px;cursor:pointer;transition:filter 150ms,transform 200ms var(--m3-emph-dec);-webkit-tap-highlight-color:transparent;animation:ab-rise 450ms var(--m3-emph-dec) both}
.ab-card:hover{filter:brightness(1.08)}.ab-card:active{filter:brightness(.95);transform:scale(.99)}
.ab-lead{width:44px;height:44px;border-radius:16px;background:var(--ab-container);color:var(--ab-on-container);display:grid;place-items:center;flex:none}
.ab-text{flex:1;min-width:0}
.ab-title{display:block;font-size:14px;line-height:20px;font-weight:700}
.ab-mono{display:block;margin-top:4px;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;line-height:14px;letter-spacing:.2px;color:var(--ab-var);opacity:.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-sub{display:block;margin-top:2px;font-size:12px;line-height:16px;color:var(--ab-var);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-trail{color:var(--ab-var);display:grid;place-items:center}
.ab-team{cursor:default;display:block}
.ab-team h3{margin:0;font-size:14px;font-weight:700}
.ab-team ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.ab-team li{display:flex;align-items:center;gap:12px}
.ab-avatar{width:40px;height:40px;border-radius:50%;background:var(--ab-container);color:var(--ab-on-container);display:grid;place-items:center;font-size:14px;font-weight:700;flex:none}
.ab-foot{margin:32px 0 0;text-align:center;font-size:12px;line-height:18px;color:var(--ab-var)}
@keyframes ab-in{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}
@keyframes ab-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ab-root,.ab-root *{animation-duration:1ms!important;animation-delay:0ms!important;transition-duration:1ms!important}}
`;

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, onReplayWelcome, themeMode = 'dark' }) => {
  useAndroidBackHandler(isOpen, onClose, 'about-modal');
  if (!isOpen) return null;

  const year = new Date().getFullYear();

  return (
    <div className={`ab-root ${themeMode === 'light' ? 'ab-light' : ''}`} role="dialog" aria-modal="true" aria-label={`About ${APP_NAME}`}>
      <style>{CSS}</style>

      <div className="ab-bar">
        <button type="button" className="ab-back" onClick={onClose} aria-label="Back">
          <Svg d={P.back} />
        </button>
        <h1>About</h1>
      </div>

      <div className="ab-scroll">
        <div className="ab-col">
          <div className="ab-hero">
            <img className="ab-icon" src="/icon-192.png" alt="" width={96} height={96} draggable={false} />
            <h2 className="ab-name">{APP_NAME}</h2>
            <span className="ab-chip">Version {APP_VERSION}</span>
            <p className="ab-desc">
              A private messenger built on Matrix. Your messages are end-to-end encrypted, and the keys stay on your devices.
            </p>
          </div>

          <div className="ab-list">
            {onReplayWelcome && (
              <button
                type="button"
                className="ab-card"
                style={{ animationDelay: '140ms' }}
                onClick={() => {
                  onClose();
                  onReplayWelcome();
                }}
              >
                <span className="ab-lead">
                  <Svg d={P.shield} />
                </span>
                <span className="ab-text">
                  <span className="ab-title">How Vibe keeps you safe</span>
                  <span className="ab-sub">Replay the welcome tour</span>
                </span>
                <span className="ab-trail">
                  <Svg d={P.chevron} />
                </span>
              </button>
            )}

            {GITHUB_URL && (
              <a className="ab-card" style={{ animationDelay: '200ms' }} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <span className="ab-lead">
                  <Svg d={P.code} />
                </span>
                <span className="ab-text">
                  <span className="ab-title">Source code on GitHub</span>
                  <span className="ab-sub">{GITHUB_URL.replace(/^https?:\/\//, '')}</span>
                  {GITHUB_OWNER && <span className="ab-mono">{GITHUB_OWNER}</span>}
                </span>
                <span className="ab-trail">
                  <Svg d={P.open} size={20} />
                </span>
              </a>
            )}

            {TEAM.length > 0 && (
              <div className="ab-card ab-team" style={{ animationDelay: '260ms' }}>
                <h3>The team</h3>
                <ul>
                  {TEAM.map((m) => (
                    <li key={m.name}>
                      <span className="ab-avatar">{initials(m.name)}</span>
                      <span className="ab-text">
                        <span className="ab-title">{m.name}</span>
                        {m.role && <span className="ab-sub">{m.role}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="ab-foot">
            Built on the Matrix open standard
            <br />© {year} {APP_NAME}
          </p>
        </div>
      </div>
    </div>
  );
};
