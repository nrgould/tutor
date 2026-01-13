# Eigen

An AI-powered study companion that watches your screen and helps you learn.

## Features

- **AI Tutor Chat** - Ask questions and get explanations powered by Claude
- **Screen Capture** - Share your screen for context-aware help
- **Knowledge Map** - Tracks topics you're learning with semantic connections
- **Spaced Repetition** - SM-2 algorithm schedules reviews at optimal intervals
- **On-Demand Quizzes** - Generate quizzes from your knowledge map
- **Memory System** - Remembers your preferences, struggles, and breakthroughs
- **Proactive Nudges** - Get helpful suggestions during study sessions

## Prerequisites

### For Running Pre-built App
- **API Keys Required:**
  - [Anthropic API Key](https://console.anthropic.com/) - Powers the AI tutor
  - [OpenAI API Key](https://platform.openai.com/api-keys) - Powers knowledge map embeddings

### For Development
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

## Installation

### Option 1: Download Release (Recommended)
1. Download the latest release for your platform
2. Install the app
3. Open Settings and add your API keys

### Option 2: Build from Source

```bash
# Clone the repository
git clone <repo-url>
cd tutor

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Or build for production
npm run tauri build
```

Built apps are located in:
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **macOS**: `src-tauri/target/release/bundle/dmg/`

## Setup

1. Launch the app
2. Go to **Settings** tab
3. Add your **Anthropic API Key** (required for chat)
4. Add your **OpenAI API Key** (required for knowledge map)
5. Start chatting!

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Toggle Overlay | `Ctrl+Shift+Space` | `Option+E` |
| Start/Stop Recording | `Ctrl+Shift+R` | `Option+R` |
| Screenshot | `Ctrl+Shift+S` | `Cmd+Shift+S` |

## Tech Stack

- **Frontend**: SvelteKit, TypeScript, TailwindCSS
- **Backend**: Tauri 2, Rust
- **Database**: SQLite (via rusqlite)
- **AI**: Claude (Anthropic), Embeddings (OpenAI)
- **Screen Capture**: xcap (cross-platform)

## macOS Permissions

On first launch, macOS will ask for:
- **Screen Recording** - Required for screen capture features
- **Accessibility** - Required for global keyboard shortcuts

## Quick Update (For Testers)

Pull the latest changes and run with a single command:

**macOS/Linux:**
```bash
./update.sh
```

**Windows:**
```cmd
update.bat
```

These scripts will automatically pull updates, install dependencies, and start the app.

## License

MIT
