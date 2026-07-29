# BrainChain Slack Surface

Slack integration for BrainChain using Socket Mode. Answer company memory questions via direct messages and channel mentions.

## Setup

### 1. Create the Slack App

Go to [api.slack.com](https://api.slack.com/apps) and create a new app:
- Choose "Create New App"
- Select "From an app manifest"
- Paste the manifest below (or copy-paste configuration manually)

### 2. App Manifest (One-Click Setup)

```yaml
display_information:
  name: BrainChain
  description: Instant answers from company memory
  background_color: "#1f2937"
features:
  bot_user:
    display_name: BrainChain
    always_online: false
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - im:history
      - im:read
      - im:write
      - chat:write
      - users:read
      - users:read.email
settings:
  event_subscriptions:
    bot_events:
      - message.im
      - app_mention
  socket_mode_enabled: true
  socket_mode_request_events_enabled: true
```

### 3. Enable Socket Mode

In your app settings:
- Go to **Socket Mode**
- Click **Enable Socket Mode**
- Generate an **App Token** with scope `connections:write`
- Copy the token (e.g., `xapp_...`)

### 4. Install to Workspace

- Go to **Install App**
- Click **Install to Workspace**
- Authorize the requested scopes
- Copy the **Bot Token** (e.g., `xoxb_...`)

### 5. Set Environment Variables

Export these five variables:

```bash
export SLACK_BOT_TOKEN="xoxb_..."           # From Install App
export SLACK_APP_TOKEN="xapp_..."           # From Socket Mode
export BRAINCHAIN_API_URL="http://localhost:8000"  # API base URL
export BRAINCHAIN_SERVICE_TOKEN="..."       # API service token
export BRAINCHAIN_WEB_URL="http://localhost:3000"  # Web UI base URL
```

### 6. Run the App

```bash
cd apps/slack
../../.venv/bin/python app.py
```

The app will connect to Slack via Socket Mode and listen for:
- **Direct messages** → answered with full answer blocks and citations
- **Channel mentions** (`@BrainChain why...`) → answered with visibility note (access is as the asker, other members may not be authorized)

## Development

Run tests:

```bash
cd apps/slack
../../.venv/bin/python -m pytest tests/ -v
```

Tests cover:
- Happy path: question → answer with citations
- Channel mention visibility note
- Error handling: unmapped user, missing email, brain unavailable, empty question
- No network calls during testing (pure logic + fake clients)

## Architecture

- **`app.py`** — Socket Mode entrypoint; loads config and registers handlers
- **`brainchain_slack/handlers.py`** — Pure event handlers (Bolt listeners) + `handle_question()` logic
- **`brainchain_slack/api_client.py`** — HTTP client to BrainChain backend
- **`brainchain_slack/config.py`** — Configuration from environment
- **`brainchain_slack/blocks.py`** — Slack Block Kit formatting for answers
