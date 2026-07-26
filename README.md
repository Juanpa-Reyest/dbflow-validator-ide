# DBFlow Validator — VS Code Extension

Zero-config local validation of PostgreSQL database changes before opening a PR.

## What it does

DBFlow Validator runs your database migration scripts against a real ephemeral PostgreSQL container (via Docker) and reports any issues directly in VS Code — with inline squiggly underlines on the problematic files and lines.

- ✅ Validates SQL syntax
- ✅ Applies migrations to a fresh Postgres instance
- ✅ Reports schema conflicts and errors
- ✅ Shows results as VS Code Diagnostics (Problems panel)

## Requirements

- **Docker** installed and running (the CLI spins up a temporary PostgreSQL container)
- No other setup needed — the extension auto-downloads the CLI binary from GitHub Releases if not found in PATH

## How to use

1. Install the extension from the VS Code Marketplace (or from `.vsix`).
2. Open a workspace containing your database migration files.
3. Run the command **DBFlow: Validate DB Changes** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4. Alternatively, click the **DBFlow: Validate** button in the status bar.
5. View results in:
   - The **Problems** panel (errors/warnings mapped to files)
   - The **DBFlow Validator** output channel (detailed logs)

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `dbflowValidator.binaryPath` | Override path to the `dbflow-validator` binary. If empty, the extension searches PATH or downloads automatically. | `""` |
| `dbflowValidator.postgresImage` | Override the PostgreSQL Docker image used for validation (e.g., `postgres:16`). | `""` |

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run tests
npm test

# Package as .vsix
npx @vscode/vsce package
```

## License

MIT
