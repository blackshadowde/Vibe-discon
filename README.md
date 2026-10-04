# Vibe - Matrix Workspace & Chat

Vibe is a beautiful, dark-themed collaboration workspace and messaging application built on top of the Matrix decentralized communication protocol. It features full timeline synchronization, progressive web app (PWA) capabilities, and persistent message push notifications.

## Features

- **Decentralized Matrix Chat**: Real-time messaging, channels, direct messages, and cross-signing.
- **PWA & Offline Ready**: Installable app experience on desktop and mobile with automatic service worker and offline capability.
- **Service Worker Push Notifications**: Native desktop and mobile notifications when push rules are triggered.
- **Customizable Experience**: Dark and light modes, customizable chat font sizes, and custom display names/avatars.

## Getting Started

### 1. Installation

Install all required dependencies:

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory (based on `.env.example`) and configure the following variables:

- `VITE_VAPID_PUBLIC_KEY`: The VAPID public key used to authorize push subscriptions with the web push service.
- `VITE_PUSH_APP_ID`: The unique app ID registered on your push gateway service.
- `VITE_PUSH_GATEWAY_URL`: The URL of your Matrix push gateway server.

### 3. Run Development Server

Start the Node.js development server:

```bash
npm run dev
```

The app will be served locally at `http://localhost:3000`.

## Build for Production

To create a production-ready optimized build of the application:

```bash
npm run build
```

