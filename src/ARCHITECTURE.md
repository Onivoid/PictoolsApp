# Project Architecture - Tauri Desktop App

> 🖥️ **Desktop Application Only** - Optimized for Tauri, no web version

## 📁 Folder Structure

```
src/
├── pages/              # Application pages (routes)
│   ├── Home.tsx
│   ├── About.tsx
│   ├── Settings.tsx
│   ├── Examples.tsx
│   └── NotFound.tsx
│
├── components/         # Reusable components
│   ├── ui/            # UI components (shadcn/ui)
│   └── ...            # Your custom components
│
├── composables/        # Custom hooks (Nuxt-style composables)
│   ├── useLocalStorage.ts   # localStorage persistence
│   ├── useTauri.ts          # Tauri commands + detection
│   ├── useDebounce.ts       # Value debouncing
│   ├── useTheme.ts          # Light/dark/system theme management
│   ├── useLanguage.ts       # Language management (i18n)
│   ├── useWindow.ts         # Window control
│   ├── useNotification.ts   # System notifications
│   └── index.ts
│
├── i18n/              # Internationalization
│   ├── index.ts       # i18n configuration
│   └── locales/       # Translation files
│       ├── en.json    # English translations
│       └── fr.json    # French translations
│
├── layouts/           # Routing layouts
│   └── RootLayout.tsx
│
├── router/            # React Router configuration (MemoryRouter)
│   └── index.tsx
│
├── utils/             # Utility functions
│   ├── format.ts
│   ├── validation.ts
│   └── index.ts
│
├── types/             # TypeScript types
│   ├── index.ts
│   ├── tauri.d.ts
│   └── i18n.d.ts
│
├── constants/         # Application constants
│   └── index.ts
│
├── stores/            # State management (create if needed)
│
├── assets/            # Static assets
│
└── lib/               # Library configuration
    └── utils.ts       # Utilities (cn for TailwindCSS)
```

## 🎯 Conventions

### Pages

- One page = one route
- PascalCase naming
- Default export of component

### Composables (Hooks)

- `use` prefix required
- Reusable logic
- Can manage state, effects, API calls, etc.

### Utils

- Pure functions
- No React hooks
- Generic utilities

### Types

- Shared interfaces and types
- PascalCase naming

### Constants

- UPPER_SNAKE_CASE variables
- Immutable values

## 🚀 Usage

### Add a new page

1. Create file in `src/pages/`
2. Add route in `src/router/index.tsx`
3. Add translations in `src/i18n/locales/en.json` and `fr.json`

### Create a composable

1. Create file in `src/composables/use[Name].ts`
2. Export from `src/composables/index.ts`

### Add utilities

1. Create or modify file in `src/utils/`
2. Export from `src/utils/index.ts`

### Add translations

1. Add key in `src/i18n/locales/en.json`
2. Add translation in `src/i18n/locales/fr.json`
3. Use with `t("your.key")` in components

## 📦 Main Dependencies

- **React Router** - Navigation (MemoryRouter for desktop)
- **TailwindCSS** - Styling
- **Lucide React** - Icons
- **Tauri v2** - Desktop app framework
- **shadcn/ui** - UI components (dialogs, modals, etc.)
- **react-i18next** - Internationalization
- **Tauri Plugins** - Notification

## Available Composables

### Core

- `useLocalStorage` - localStorage persistence with sync
- `useTauriCommand` - Rust backend command calls
- `useIsTauri` - Always returns `true` (desktop app only)
- `useDebounce` - Value debouncing
- `useTheme` - Theme management (light/dark/system) with persistence
- `useLanguage` - Language management (en/fr) with persistence

### Tauri APIs

- `useWindow` - Window control (minimize, maximize, close, fullscreen)
- `useNotification` - Native system notifications

> 💡 **Dialogs & Modals**: Use shadcn/ui components (Dialog, AlertDialog, etc.) for UI modals.
>
> ✅ **Required Plugin**: `@tauri-apps/plugin-notification` (already installed)
