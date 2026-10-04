import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WELCOME_SEEN_KEY } from '../appInfo';

interface WelcomeScreenProps {
  /** Start the entrance animation (set to true once the splash has finished). */
  ready?: boolean;
  /** Called when the user finishes or skips the tour. */
  onDone: () => void;
}

// ---- Material icon paths (24x24) ----
const ICONS = {
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  phone: 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
  server: 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  eyeOff: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  arrowFwd: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
};

type IconName = keyof typeof ICONS;

const Icon: React.FC<{ name: IconName; size?: number; className?: string }> = ({ name, size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d={ICONS[name]} />
  </svg>
);

const buzz = (pattern: number | number[]) => {
  try {
    if (localStorage.getItem('haptic_enabled') === 'false') return;
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // ignore
  }
};

interface Fact {
  icon: IconName;
  title: string;
  text: string;
}

// ---- Page illustrations (pure CSS / SVG animation) ----
const HeroWelcome: React.FC = () => (
  <div className="vw-hero vw-hero-welcome" aria-hidden="true">
    <span className="vw-ring vw-ring-1" />
    <span className="vw-ring vw-ring-2" />
    <span className="vw-ring vw-ring-3" />
    <div className="vw-bubble">
      <span className="vw-bubble-text">vibe</span>
      <span className="vw-bubble-lock">
        <Icon name="lock" size={22} />
      </span>
    </div>
  </div>
);

const HeroTransit: React.FC = () => (
  <div className="vw-hero vw-hero-transit" aria-hidden="true">
    <div className="vw-node">
      <Icon name="phone" size={30} />
      <span>You</span>
    </div>
    <div className="vw-track">
      <span className="vw-track-line" />
      <span className="vw-packet">
        <span className="vw-packet-plain">Hi 👋</span>
        <span className="vw-packet-scrambled">•••••</span>
      </span>
    </div>
    <div className="vw-node vw-node-server">
      <Icon name="server" size={30} />
      <span>Server</span>
      <em>sees •••••</em>
    </div>
    <div className="vw-track">
      <span className="vw-track-line" />
      <span className="vw-packet vw-packet-2">
        <span className="vw-packet-scrambled vw-packet-scrambled-2">•••••</span>
        <span className="vw-packet-plain vw-packet-plain-2">Hi 👋</span>
      </span>
    </div>
    <div className="vw-node">
      <Icon name="phone" size={30} />
      <span>Friend</span>
    </div>
  </div>
);

const HeroKeys: React.FC = () => (
  <div className="vw-hero vw-hero-keys" aria-hidden="true">
    <div className="vw-device vw-device-a">
      <Icon name="phone" size={34} />
      <span className="vw-device-key">
        <Icon name="key" size={16} />
      </span>
    </div>
    <div className="vw-vault">
      <Icon name="shield" size={40} />
      <span>Recovery key</span>
    </div>
    <div className="vw-device vw-device-b">
      <Icon name="phone" size={34} />
      <span className="vw-device-key vw-device-key-2">
        <Icon name="key" size={16} />
      </span>
    </div>
    <span className="vw-pulse-line vw-pulse-line-a" />
    <span className="vw-pulse-line vw-pulse-line-b" />
  </div>
);

const HeroSmall: React.FC = () => (
  <div className="vw-hero vw-hero-small" aria-hidden="true">
    <div className="vw-notif">
      <span className="vw-notif-icon">
        <Icon name="bell" size={20} />
      </span>
      <div>
        <strong>Vibe</strong>
        <p>New message</p>
      </div>
    </div>
    <div className="vw-notif vw-notif-ghost">
      <span className="vw-notif-icon">
        <Icon name="eyeOff" size={20} />
      </span>
      <div>
        <strong>Message text</strong>
        <p>never leaves the chat</p>
      </div>
    </div>
  </div>
);

interface Page {
  id: string;
  kicker: string;
  title: string;
  body: string;
  hero: React.ReactNode;
  facts: Fact[];
  note?: string;
}

const PAGES: Page[] = [
  {
    id: 'welcome',
    kicker: 'Welcome to Vibe',
    title: 'Chat that stays between you and them',
    body: 'Vibe is a private messenger built on Matrix, an open standard for secure communication. Here is how it keeps you safer, in 30 seconds.',
    hero: <HeroWelcome />,
    facts: [
      { icon: 'lock', title: 'Private by default', text: 'Chats you start in Vibe are end-to-end encrypted.' },
      { icon: 'person', title: 'No phone number', text: 'Sign up with just a username and password.' },
    ],
  },
  {
    id: 'e2ee',
    kicker: 'How it works',
    title: 'Locked before it leaves your phone',
    body: 'Each message is scrambled on your device and only unlocked on the devices in that chat. Even the server in the middle only carries scrambled text.',
    hero: <HeroTransit />,
    facts: [
      { icon: 'shield', title: 'Server cannot read it', text: 'Message content is unreadable to the server and to anyone who intercepts it.' },
      { icon: 'eyeOff', title: 'Be aware', text: 'Servers can still see who chats with whom and when. Content stays private.' },
    ],
  },
  {
    id: 'keys',
    kicker: 'Why it is safer',
    title: 'Your keys stay on your devices',
    body: 'Every device you sign in on creates its own keys. To read old messages on a new phone, you use a recovery key that only you hold.',
    hero: <HeroKeys />,
    facts: [
      { icon: 'key', title: 'Back up once', text: 'Set up message backup in Settings, Security, Encryption & Keys.' },
      { icon: 'lock', title: 'Keep the key safe', text: 'Lose the key and every device, and old messages stay locked. That is the price of real privacy.' },
    ],
  },
  {
    id: 'small',
    kicker: 'The little things',
    title: 'Safer in the details too',
    body: 'Privacy is not just encryption. Vibe keeps the small stuff quiet as well.',
    hero: <HeroSmall />,
    facts: [
      { icon: 'bell', title: 'Quiet notifications', text: 'Push alerts say "New message". They never include what was written.' },
      { icon: 'code', title: 'Open standard', text: 'Built on Matrix, a public protocol anyone can inspect, not a closed system.' },
      { icon: 'check', title: 'Delete for everyone', text: 'Remove your own messages from the chat for all members.' },
    ],
  },
];

const CSS = `
.vw-root{--vw-bg:#1b1c20;--vw-surface:#2b2d31;--vw-outline:#3f4147;--vw-on:#e6e7ea;--vw-on-var:#b5bac1;--vw-primary:#5865f2;--vw-on-primary:#fff;--vw-container:rgba(88,101,242,.18);--vw-on-container:#c9cfff;
--m3-emph:cubic-bezier(.2,0,0,1);--m3-emph-dec:cubic-bezier(.05,.7,.1,1);--m3-emph-acc:cubic-bezier(.3,0,.8,.15);--m3-std:cubic-bezier(.2,0,0,1);--m3-spring:cubic-bezier(.34,1.56,.64,1);
position:absolute;inset:0;display:flex;flex-direction:column;background:var(--vw-bg);color:var(--vw-on);font-family:"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;overflow:hidden;
padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);user-select:none;-webkit-user-select:none;touch-action:pan-y}
.vw-root::before{content:"";position:absolute;inset:-20% -20% auto -20%;height:60%;background:radial-gradient(60% 60% at 50% 0%,rgba(88,101,242,.28),rgba(88,101,242,0));pointer-events:none}
.vw-root:not(.vw-ready) .vw-top,.vw-root:not(.vw-ready) .vw-stage,.vw-root:not(.vw-ready) .vw-bottom{opacity:0}
.vw-ready .vw-top{animation:vw-fade-in 400ms var(--m3-emph-dec) both}
.vw-ready .vw-stage{animation:vw-container-in 520ms var(--m3-emph-dec) 60ms both}
.vw-ready .vw-bottom{animation:vw-rise 480ms var(--m3-emph-dec) 220ms both}
.vw-top{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0;min-height:56px;position:relative;z-index:1}
.vw-brand{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.2px}
.vw-brand-dot{width:28px;height:28px;border-radius:10px;background:var(--vw-container);color:var(--vw-on-container);display:grid;place-items:center}
.vw-stage{flex:1;min-height:0;overflow-y:auto;padding:8px 20px 8px;position:relative;z-index:1;display:flex;flex-direction:column}
.vw-page{margin:auto 0;width:100%;max-width:520px;align-self:center}
.vw-page.vw-enter-fwd{animation:vw-sa-in-fwd 300ms var(--m3-emph-dec) both}
.vw-page.vw-enter-back{animation:vw-sa-in-back 300ms var(--m3-emph-dec) both}
.vw-page.vw-exit-fwd{animation:vw-sa-out-fwd 110ms var(--m3-emph-acc) both}
.vw-page.vw-exit-back{animation:vw-sa-out-back 110ms var(--m3-emph-acc) both}
.vw-kicker{font-size:12px;line-height:16px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:var(--vw-on-container);margin:14px 0 6px}
.vw-title{font-size:28px;line-height:36px;font-weight:700;margin:0 0 10px;letter-spacing:-.2px}
.vw-body{font-size:16px;line-height:24px;letter-spacing:.3px;color:var(--vw-on-var);margin:0 0 16px}
.vw-facts{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.vw-fact{display:flex;gap:12px;align-items:flex-start;background:var(--vw-surface);border:1px solid var(--vw-outline);border-radius:20px;padding:12px 14px}
.vw-fact-icon{flex:none;width:40px;height:40px;border-radius:14px;background:var(--vw-container);color:var(--vw-on-container);display:grid;place-items:center}
.vw-fact h4{margin:0;font-size:14px;line-height:20px;font-weight:700}
.vw-fact p{margin:2px 0 0;font-size:13px;line-height:18px;color:var(--vw-on-var)}
.vw-enter-fwd .vw-fact,.vw-enter-back .vw-fact,.vw-ready .vw-first .vw-fact{animation:vw-rise 420ms var(--m3-emph-dec) both}
.vw-fact:nth-child(1){animation-delay:120ms!important}.vw-fact:nth-child(2){animation-delay:170ms!important}.vw-fact:nth-child(3){animation-delay:220ms!important}
.vw-bottom{padding:8px 20px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;z-index:1;max-width:560px;width:100%;align-self:center}
.vw-dots{display:flex;gap:8px;align-items:center}
.vw-dot{height:8px;width:8px;border-radius:999px;background:var(--vw-outline);border:0;padding:0;cursor:pointer;transition:width 350ms var(--m3-emph),background-color 250ms var(--m3-std)}
.vw-dot[aria-selected="true"]{width:28px;background:var(--vw-primary)}
.vw-btn{position:relative;overflow:hidden;font:inherit;font-size:14px;line-height:20px;font-weight:600;letter-spacing:.1px;height:48px;padding:0 24px;border-radius:999px;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;-webkit-tap-highlight-color:transparent;transition:box-shadow 200ms var(--m3-std),transform 200ms var(--m3-emph)}
.vw-btn::after{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity 150ms var(--m3-std)}
.vw-btn:hover::after{opacity:.08}.vw-btn:active::after{opacity:.14}.vw-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.vw-btn-filled{background:var(--vw-primary);color:var(--vw-on-primary);box-shadow:0 1px 3px rgba(0,0,0,.35)}
.vw-btn-filled:active{transform:scale(.97)}
.vw-btn-text{background:transparent;color:var(--vw-on-container);padding:0 16px}
.vw-btn-final{padding:0 28px}
.vw-ripple{position:absolute;border-radius:50%;background:currentColor;opacity:.22;transform:scale(0);animation:vw-ripple 520ms var(--m3-std) forwards;pointer-events:none}
.vw-hero{position:relative;height:190px;border-radius:28px;background:linear-gradient(160deg,rgba(88,101,242,.22),rgba(88,101,242,.06));border:1px solid rgba(88,101,242,.25);overflow:hidden;display:flex;align-items:center;justify-content:center}
.vw-ring{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid rgba(139,151,255,.5);animation:vw-ring 3.2s var(--m3-emph-dec) infinite}
.vw-ring-2{animation-delay:1.05s}.vw-ring-3{animation-delay:2.1s}
.vw-bubble{position:relative;background:#f4f5fb;color:#141826;border-radius:30px 30px 30px 8px;padding:14px 18px 14px 20px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);animation:vw-pop 700ms var(--m3-spring) 300ms both}
.vw-bubble-text{font-family:"Brush Script MT","Segoe Script",cursive;font-size:34px;line-height:1;font-weight:700}
.vw-bubble-lock{width:40px;height:40px;border-radius:50%;background:#5865f2;color:#fff;display:grid;place-items:center;animation:vw-lock-bounce 3.2s var(--m3-emph) 1.2s infinite}
.vw-hero-transit{gap:2px;padding:0 6px}
.vw-node{flex:none;width:68px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:600;color:var(--vw-on)}
.vw-node svg{color:var(--vw-on-container)}
.vw-node em{font-style:normal;font-size:10px;color:var(--vw-on-var)}
.vw-node-server{color:var(--vw-on-var)}
.vw-track{position:relative;flex:1;height:44px}
.vw-track-line{position:absolute;left:0;right:0;top:50%;border-top:2px dashed rgba(139,151,255,.45)}
.vw-packet{position:absolute;top:50%;left:0;transform:translate(0,-50%);height:26px;min-width:44px;border-radius:13px;background:#5865f2;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;padding:0 8px;animation:vw-travel 3.6s var(--m3-emph) infinite}
.vw-packet-plain,.vw-packet-scrambled{grid-area:1/1}
.vw-packet-plain{animation:vw-swap-out 3.6s linear infinite}
.vw-packet-scrambled{animation:vw-swap-in 3.6s linear infinite;letter-spacing:2px}
.vw-packet-2{animation:vw-travel-2 3.6s var(--m3-emph) infinite}
.vw-packet-scrambled-2{animation:vw-swap-out 3.6s linear infinite}
.vw-packet-plain-2{animation:vw-swap-in-2 3.6s linear infinite}
.vw-hero-keys{gap:10px;padding:0 10px}
.vw-device{position:relative;flex:none;width:76px;height:96px;border-radius:22px;background:var(--vw-surface);border:1px solid var(--vw-outline);display:grid;place-items:center;color:var(--vw-on)}
.vw-device-key{position:absolute;right:-6px;bottom:-6px;width:28px;height:28px;border-radius:50%;background:#5865f2;color:#fff;display:grid;place-items:center;animation:vw-pop 600ms var(--m3-spring) 500ms both}
.vw-device-key-2{animation-delay:800ms}
.vw-vault{flex:none;width:92px;height:112px;border-radius:26px;background:var(--vw-container);color:var(--vw-on-container);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:11px;font-weight:700;text-align:center;animation:vw-breathe 3s var(--m3-emph) infinite}
.vw-pulse-line{position:absolute;top:50%;height:2px;width:30px;background:linear-gradient(90deg,transparent,#8b97ff,transparent);animation:vw-dash 2.4s var(--m3-emph) infinite}
.vw-pulse-line-a{left:27%}.vw-pulse-line-b{right:27%;animation-delay:1.2s}
.vw-hero-small{flex-direction:column;gap:10px;padding:0 18px;align-items:stretch}
.vw-notif{display:flex;align-items:center;gap:12px;background:#f4f5fb;color:#141826;border-radius:20px;padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.3);animation:vw-slide-down 600ms var(--m3-emph-dec) 250ms both}
.vw-notif strong{font-size:13px}.vw-notif p{margin:0;font-size:12px;color:#4a5164}
.vw-notif-icon{width:36px;height:36px;border-radius:12px;background:#5865f2;color:#fff;display:grid;place-items:center;flex:none}
.vw-notif-ghost{background:rgba(244,245,251,.08);color:var(--vw-on);box-shadow:none;border:1px dashed rgba(139,151,255,.5);animation-delay:450ms}
.vw-notif-ghost p{color:var(--vw-on-var)}.vw-notif-ghost .vw-notif-icon{background:var(--vw-container);color:var(--vw-on-container)}
@keyframes vw-fade-in{from{opacity:0}to{opacity:1}}
@keyframes vw-container-in{from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:none}}
@keyframes vw-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes vw-sa-in-fwd{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
@keyframes vw-sa-in-back{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}
@keyframes vw-sa-out-fwd{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-30px)}}
@keyframes vw-sa-out-back{from{opacity:1;transform:none}to{opacity:0;transform:translateX(30px)}}
@keyframes vw-ring{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.2);opacity:0}}
@keyframes vw-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes vw-lock-bounce{0%,70%,100%{transform:none}80%{transform:scale(1.18) rotate(-8deg)}90%{transform:scale(.96) rotate(4deg)}}
@keyframes vw-travel{0%{left:0;opacity:0}8%{opacity:1}55%,100%{left:calc(100% - 44px);opacity:1}92%{opacity:1}100%{opacity:0}}
@keyframes vw-travel-2{0%,45%{left:0;opacity:0}55%{opacity:1}92%{left:calc(100% - 44px);opacity:1}100%{left:calc(100% - 44px);opacity:0}}
@keyframes vw-swap-out{0%,18%{opacity:1}30%,100%{opacity:0}}
@keyframes vw-swap-in{0%,18%{opacity:0}30%,100%{opacity:1}}
@keyframes vw-swap-in-2{0%,70%{opacity:0}85%,100%{opacity:1}}
@keyframes vw-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes vw-dash{0%{opacity:0;transform:translateX(-10px)}50%{opacity:1}100%{opacity:0;transform:translateX(10px)}}
@keyframes vw-slide-down{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}
@keyframes vw-ripple{to{transform:scale(1);opacity:0}}
@media (max-height:640px){.vw-hero{height:150px}.vw-title{font-size:24px;line-height:32px}.vw-body{font-size:14px;line-height:20px}}
@media (prefers-reduced-motion:reduce){.vw-root *,.vw-root *::before,.vw-root *::after{animation-duration:1ms!important;animation-delay:0ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
`;

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ ready = true, onDone }) => {
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [dir, setDir] = useState<1 | -1>(1);
  const busyRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const reduced =
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    buzz(15);
    onDone();
  }, [onDone]);

  const go = useCallback(
    (next: number) => {
      if (busyRef.current || next === page || next < 0 || next >= PAGES.length) return;
      buzz(6);
      if (reduced) {
        setPage(next);
        return;
      }
      busyRef.current = true;
      setDir(next > page ? 1 : -1);
      setPhase('exit');
      window.setTimeout(() => {
        setPage(next);
        setPhase('enter');
        window.setTimeout(() => {
          setPhase('idle');
          busyRef.current = false;
        }, 300);
      }, 110);
    },
    [page, reduced]
  );

  const next = useCallback(() => {
    if (page >= PAGES.length - 1) finish();
    else go(page + 1);
  }, [page, go, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, go, page]);

  const addRipple = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const span = document.createElement('span');
    span.className = 'vw-ripple';
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(span);
    window.setTimeout(() => span.remove(), 560);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next();
      else go(page - 1);
    }
  };

  const current = PAGES[page];
  const isLast = page === PAGES.length - 1;
  const pageClass =
    phase === 'exit'
      ? dir === 1
        ? 'vw-exit-fwd'
        : 'vw-exit-back'
      : phase === 'enter'
        ? dir === 1
          ? 'vw-enter-fwd'
          : 'vw-enter-back'
        : page === 0
          ? 'vw-first'
          : '';

  return (
    <div
      className={`vw-root ${ready ? 'vw-ready' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-label="Welcome to Vibe"
    >
      <style>{CSS}</style>
      <div className="vw-top">
        <div className="vw-brand">
          <span className="vw-brand-dot">
            <Icon name="lock" size={16} />
          </span>
          Vibe
        </div>
        {!isLast && (
          <button type="button" className="vw-btn vw-btn-text" onPointerDown={addRipple} onClick={finish}>
            Skip
          </button>
        )}
      </div>

      <div className="vw-stage">
        <section key={current.id} className={`vw-page ${pageClass}`} aria-live="polite">
          {current.hero}
          <div className="vw-kicker">{current.kicker}</div>
          <h2 className="vw-title">{current.title}</h2>
          <p className="vw-body">{current.body}</p>
          <ul className="vw-facts">
            {current.facts.map((f) => (
              <li className="vw-fact" key={f.title}>
                <span className="vw-fact-icon">
                  <Icon name={f.icon} size={22} />
                </span>
                <div>
                  <h4>{f.title}</h4>
                  <p>{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="vw-bottom">
        <div className="vw-dots" role="tablist" aria-label="Welcome pages">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={`Page ${i + 1} of ${PAGES.length}`}
              className="vw-dot"
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className={`vw-btn vw-btn-filled ${isLast ? 'vw-btn-final' : ''}`}
          onPointerDown={addRipple}
          onClick={next}
        >
          {isLast ? 'Get started' : 'Next'}
          <Icon name="arrowFwd" size={18} />
        </button>
      </div>
    </div>
  );
};
