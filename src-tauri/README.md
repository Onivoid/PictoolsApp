# Architecture Rust Backend

## 📁 Structure

```
src-tauri/
├── src/
│   ├── lib.rs              # Point d'entrée principal
│   ├── main.rs             # Binary entry point
│   └── commands/           # Commandes Tauri
│       ├── mod.rs          # Module exports
│       └── system.rs       # Commandes système
│
├── Cargo.toml              # Dépendances Rust
└── tauri.conf.json         # Configuration Tauri
```

## 🎯 Organisation des Commandes

### `commands/system.rs`
Commandes liées au système :
- `greet(name: &str)` - Exemple de salutation
- `get_system_info()` - Informations système (OS, arch, version)

## 📝 Ajouter une Nouvelle Commande

### 1. Créer un nouveau module (optionnel)
```rust
// src/commands/mon_module.rs
#[tauri::command]
pub fn ma_commande(param: &str) -> String {
    format!("Résultat: {}", param)
}
```

### 2. Exporter depuis `commands/mod.rs`
```rust
pub mod system;
pub mod mon_module;

pub use system::*;
pub use mon_module::*;
```

### 3. Enregistrer dans `lib.rs`
```rust
.invoke_handler(tauri::generate_handler![
    greet,
    get_system_info,
    ma_commande
])
```

## 🔧 Plugins Configurés

- `tauri-plugin-opener` - Ouvrir URLs/fichiers
- `tauri-plugin-fs` - Système de fichiers
- `tauri-plugin-notification` - Notifications système

## 🚀 Bonnes Pratiques

1. **Modularité** - Séparez les commandes par domaine fonctionnel
2. **Types** - Utilisez des structs avec `Serialize`/`Deserialize` pour les retours complexes
3. **Erreurs** - Retournez `Result<T, String>` pour gérer les erreurs proprement
4. **Documentation** - Commentez vos commandes publiques

## 📦 Exemple de Commande avec Gestion d'Erreur

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: u32,
    pub name: String,
}

#[tauri::command]
pub fn get_user(id: u32) -> Result<User, String> {
    if id == 0 {
        return Err("ID invalide".to_string());
    }
    
    Ok(User {
        id,
        name: "John Doe".to_string(),
    })
}
```

## 🔗 Utilisation depuis React

```typescript
import { invoke } from "@tauri-apps/api/core";

// Appel simple
const result = await invoke<string>("greet", { name: "World" });

// Avec gestion d'erreur
try {
    const user = await invoke<User>("get_user", { id: 1 });
    console.log(user);
} catch (error) {
    console.error(error);
}

// Avec le hook useTauriCommand
const { data, loading, error, execute } = useTauriCommand<User>("get_user", { id: 1 });
```
