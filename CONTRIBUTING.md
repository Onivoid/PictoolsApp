# Contributing Guide

Thank you for your interest in contributing to this boilerplate! 🎉

## 🚀 How to Contribute

### Report a Bug

1. Check that the bug hasn't already been reported in [Issues](https://github.com/your-username/tauri-react-boilerplate/issues)
2. Create a new issue with:
    - A descriptive title
    - Steps to reproduce the bug
    - Expected vs actual behavior
    - Your environment (OS, Node/Rust/Tauri versions)

### Propose a Feature

1. Open an issue to discuss the feature
2. Wait for feedback before starting development
3. Follow project conventions

### Submit a Pull Request

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Commit** your changes: `git commit -m "feat: add my feature"`
5. **Push** to your fork: `git push origin feature/my-feature`
6. **Open a Pull Request** to `main`

## 📝 Conventions

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting, missing semicolons, etc.
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance, dependencies, etc.

### Code

- **TypeScript**: Use explicit types
- **React**: Prefer functional components and hooks
- **Rust**: Follow standard Rust conventions
- **Naming**:
    - React components: PascalCase
    - Hooks: camelCase with `use` prefix
    - Files: kebab-case or PascalCase depending on type

### Style

- Use project formatting tools (Prettier, rustfmt)
- Respect existing architecture
- Document public functions
- Add comments for complex logic

## 🧪 Testing

Before submitting a PR:

1. Test your code locally: `pnpm tauri dev`
2. Check the build: `pnpm tauri build`
3. Ensure there are no TypeScript errors
4. Test on your target OS

## 📚 Documentation

- Update README if necessary
- Document new features
- Add usage examples
- Update ARCHITECTURE.md for structural changes
- Add translations in both `en.json` and `fr.json` for new UI text

## ✅ PR Checklist

- [ ] Code follows project conventions
- [ ] Commits follow Conventional Commits
- [ ] Documentation is up to date
- [ ] Code has been tested locally
- [ ] No TypeScript/Rust warnings
- [ ] PR has a clear description
- [ ] Translations added for new text (if applicable)

## 🤝 Code of Conduct

- Be respectful and constructive
- Welcome new contributors
- Focus on code, not people
- Accept constructive criticism

## 💬 Questions?

Feel free to open an issue for any questions!

Thank you for your contribution! 🙏
