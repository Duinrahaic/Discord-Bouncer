# Discord Bouncer

A Discord bot that guards access to a support channel using a passphrase gate. Users who type the correct passphrase in a designated channel are automatically granted a configured role. All verification attempts are logged for auditing.

## How it works

1. A server owner configures a channel, passphrase, and role via `/setup-support-access`.
2. The bot watches that channel. When a user posts a message, the bot deletes it and checks if it matches the passphrase.
3. On a match, the user receives the configured role and gets a welcome message (auto-deleted after 5 seconds).
4. All attempts (pass and fail) are stored in a local SQLite database.
5. Server owners can review the last 1,000 attempts via `/verification-history` — results are sent as a DM.

## Commands

| Command | Permission | Description |
|---|---|---|
| `/setup-support-access` | Server owner | Set the gate channel, passphrase, and role |
| `/verification-history` | Server owner | DM a table of the last 1,000 verification attempts |

## Bot permissions required

The bot needs the following permissions in the gate channel:

- **Manage Messages** — to delete user messages after reading them
- **Manage Roles** — to grant the configured role
- **Send Messages** — to post and clean up the welcome confirmation

## Setup

### 1. Create a Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Under **Bot**, create a bot and copy the token.
3. Under **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, add the permissions above, and use the generated URL to invite the bot to your server.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your bot token:

```
DISCORD_TOKEN=your_token_here
```

## Running

### Docker (recommended)

```bash
docker compose up -d
```

The SQLite database is persisted in a named Docker volume (`bouncer-data`).

### Local (Node.js 22+)

```bash
npm install
npm run build
npm start
```

For development with live reload:

```bash
npm run dev
```
