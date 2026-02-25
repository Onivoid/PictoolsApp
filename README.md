# 🚀 PictoolsApp

A modern, production-ready desktop application built with Tauri v2, React 19, TypeScript, and TailwindCSS.

[![Tauri](https://img.shields.io/badge/Tauri-2.x-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## ✨ Features

- ⚡️ **Vite** - Lightning-fast build tool
- ⚛️ **React 19** - Latest version with modern hooks
- 🦀 **Tauri v2** - Lightweight and secure desktop framework
- 🎨 **TailwindCSS v4** - Modern and responsive styling
- 🧩 **shadcn/ui** - Elegant and accessible UI components
- 🎯 **TypeScript** - Full type-safety
- 🗂️ **Modular Architecture** - Clean and scalable organization
- 🌓 **Light/Dark Theme** - With system preference support
- 🔔 **Native Notifications** - System integration
- 🪟 **Window Control** - Complete API (minimize, maximize, close)
- 📦 **Composables** - Reusable hooks (Nuxt-style)
- 🌍 **i18n** - Internationalization with English & French
- 🔄 **Auto-Updates** - Built-in automatic update system with signed releases

## 📁 Project Structure

```
├── src/
│   ├── pages/              # Application pages
│   ├── components/         # Reusable components
│   │   └── ui/            # shadcn/ui components
│   ├── composables/        # Custom hooks
│   ├── layouts/           # Routing layouts
│   ├── router/            # React Router configuration
│   ├── i18n/              # Internationalization
│   │   └── locales/       # Translation files (en, fr)
│   ├── utils/             # Utility functions
│   ├── types/             # TypeScript types
│   └── constants/         # App constants
│
├── src-tauri/
│   └── src/
│       ├── commands/      # Modular Rust commands
│       └── lib.rs         # Tauri entry point
│
└── docs/                  # Detailed documentation
```

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Rust](https://www.rust-lang.org/) (latest stable)

### Installation

```bash
# Clone the repository
git clone https://github.com/Onivoid/PictoolsApp.git
cd PictoolsApp

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## 📚 Documentation

- **[Architecture](src/ARCHITECTURE.md)** - Project structure and conventions
- **[Tauri Plugins](TAURI_PLUGINS.md)** - Plugin configuration
- **[Rust Backend](src-tauri/README.md)** - Rust code organization

## 🎯 Available Composables

### Core

- `useLocalStorage` - Persistence with automatic sync
- `useTauriCommand` - Rust command calls
- `useDebounce` - Value debouncing
- `useTheme` - Theme management (light/dark/system)
- `useLanguage` - Language management (en/fr)

### Tauri APIs

- `useWindow` - Window control
- `useNotification` - System notifications

## 🛠️ Available Scripts

```bash
pnpm dev          # Run in development mode
pnpm build        # Build frontend
pnpm tauri dev    # Run Tauri app in dev mode
pnpm tauri build  # Build app for production
```

## 🔄 Auto-Update System

PictoolsApp includes a fully configured automatic update system using Tauri's updater plugin.

### How it works

1. **Check for updates**: The app automatically checks for new versions on startup
2. **User notification**: A notification appears in the bottom-right corner when an update is available
3. **Download & Install**: Users can install updates with one click
4. **Signed releases**: All updates are cryptographically signed for security

### Configuration

The updater is configured in `src-tauri/tauri.conf.json`:

```json
{
    "plugins": {
        "updater": {
            "pubkey": "YOUR_PUBLIC_KEY",
            "endpoints": [
                "https://github.com/{{owner}}/{{repo}}/releases/latest/download/latest.json"
            ]
        }
    }
}
```

### Setting up for your project

1. **Generate signing keys** (already done for this project):

    ```bash
    pnpm tauri signer generate -w ~/.tauri/myapp.key
    ```

2. **Add secrets to GitHub**:
    - `TAURI_SIGNING_PRIVATE_KEY`: Content of `~/.tauri/myapp.key`
    - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password you set during key generation

3. **Update the public key** in `src-tauri/tauri.conf.json`:

    ```bash
    cat ~/.tauri/myapp.key.pub
    ```

4. **Customize the endpoint** in `tauri.conf.json` with your GitHub repo

### Release workflow

The CI automatically:

- Builds for macOS (ARM + Intel), Linux, and Windows
- Signs all binaries with your private key
- Generates `latest.json` with update metadata
- Publishes the release to GitHub

Users will automatically receive update notifications when you push a new version tag.

## 🎨 Customization

### Add a new page

1. Create file in `src/pages/`
2. Add route in `src/router/index.tsx`
3. Add constant in `src/constants/index.ts`
4. Add translations in `src/i18n/locales/en.json` and `fr.json`

### Create a composable

1. Create `src/composables/use[Name].ts`
2. Export from `src/composables/index.ts`

### Add a Rust command

1. Create/modify file in `src-tauri/src/commands/`
2. Export from `src-tauri/src/commands/mod.rs`
3. Register in `src-tauri/src/lib.rs`

### Add a translation

1. Add key in `src/i18n/locales/en.json`
2. Add translation in `src/i18n/locales/fr.json`
3. Use with `t("your.key")` in components

## 🔧 Technologies Used

- **Frontend**: React 19, TypeScript, TailwindCSS, Vite
- **UI**: shadcn/ui, Lucide Icons
- **Routing**: React Router v7 (MemoryRouter)
- **i18n**: react-i18next
- **Backend**: Rust, Tauri v2
- **Plugins**: Updater, Process, Notification, Opener

## 📝 Best Practices

- ✅ Modular and reusable code
- ✅ Type-safety with TypeScript
- ✅ Scalable architecture
- ✅ Clean error handling
- ✅ Inline documentation
- ✅ Consistent naming conventions
- ✅ Internationalization ready

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Desktop framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Vite](https://vitejs.dev/) - Build tool
- [react-i18next](https://react.i18next.com/) - Internationalization

## 📞 Support

- 📖 [Tauri Documentation](https://tauri.app/v2/guides/)
- 💬 [Tauri Discord](https://discord.com/invite/tauri)
- 🐛 [GitHub Issues](https://github.com/Onivoid/PictoolsApp/issues)

---

Made with ❤️ for the Tauri community
