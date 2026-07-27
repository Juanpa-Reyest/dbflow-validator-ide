# DBFlow Validator

**Validate your PostgreSQL database changes locally before opening a PR.** One click, zero config.

DBFlow Validator spins up a real ephemeral PostgreSQL instance via Docker, applies your migrations (Liquibase), runs sync + rollback, and reports exactly what broke — all without touching shared environments.

---

## ⚡ How it works

```
Your SQL changes → Docker PostgreSQL → Liquibase sync & rollback → ✅ or ❌
```

1. Click **▶** in the editor title bar (or `Ctrl+Alt+V`)
2. The extension runs the full validation pipeline in seconds
3. See results in a rich WebView with:
   - **Pipeline tab** — step-by-step execution with failure traces
   - **Quality Report tab** — detailed script analysis (HTML report)

No database credentials. No shared environments. No broken PRs.

---

## ✨ Features

| | |
|---|---|
| 🔌 **Zero config** | Install → click → result. Auto-downloads the CLI binary. |
| 🐘 **Real PostgreSQL** | Validates against a real Postgres 17 instance, not a mock. |
| 📊 **Rich reports** | WebView with pipeline steps, quality metrics, and artifacts. |
| 🔄 **Sync + Rollback** | Tests both directions — if rollback fails, you'll know before the PR. |
| 📜 **Execution history** | Sidebar with past runs for quick comparison. |
| ⌨️ **Multiple triggers** | Button, keybinding (`Ctrl+Alt+V`), or Command Palette. |

---

## 📋 Requirements

- **Docker** running (the CLI handles everything else)
- A workspace with Liquibase-based database changelogs

That's it. No Java, no Maven, no manual setup.

---

## 🚀 Getting started

1. Install the extension
2. Open your database project in VS Code
3. Press `Ctrl+Alt+V` (or click ▶ in the title bar)
4. Wait for the pipeline to complete (~30-60s first run, faster after)
5. Review results in the WebView panel

---

## ⚙️ Settings

| Setting | Description |
|---------|-------------|
| `dbflowValidator.binaryPath` | Custom path to the CLI binary (leave empty for auto-download) |
| `dbflowValidator.postgresImage` | Custom PostgreSQL Docker image (default: `postgres-partman:17.7`) |

---

## 📎 Links

- [CLI Repository](https://github.com/Juanpa-Reyest/dbflow-validator) — the engine behind the extension
- [Report an issue](https://github.com/Juanpa-Reyest/dbflow-validator-ide/issues)

---

*Built for teams that ship database changes with confidence.*
