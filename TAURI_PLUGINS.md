# Installed Tauri Plugins

## ✅ Installed Plugin

### Notification (useNotification)

```bash
pnpm add @tauri-apps/plugin-notification
```

✅ **Installed** - Enables native system notifications

## ⚙️ Tauri Configuration

The plugin is already configured in `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

And in `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-notification = "2"
```

## 📝 Composables Without Plugin

These composables work without additional plugin installation:

- **useWindow** - Tauri core API
- **useTauriCommand** - Tauri core API
- **useLocalStorage** - Web API
- **useDebounce** - React hook
- **useLanguage** - react-i18next
- **useTheme** - localStorage + Web API

## Optional Plugins

If you need additional features, here are some useful plugins:

### File System

For file reading/writing:

```bash
pnpm add @tauri-apps/plugin-fs
```

### Dialog

For system dialogs (file selection, native messages):

```bash
pnpm add @tauri-apps/plugin-dialog
```

> **Note**: For UI modals/dialogs, use shadcn/ui (Dialog, AlertDialog, etc.)

### Clipboard

For system clipboard:

```bash
pnpm add @tauri-apps/plugin-clipboard-manager
```

### Store

For secure persistent storage:

```bash
pnpm add @tauri-apps/plugin-store
```

Check the [official documentation](https://tauri.app/v2/plugins/) for the complete list of available plugins.
