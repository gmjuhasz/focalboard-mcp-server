# Focalboard MCP Server

A Model Context Protocol (MCP) server for [Focalboard](https://github.com/mattermost-community/focalboard), enabling task and board management through Claude and other MCP-compatible clients.

## Features

- **Board Management**: List, search, and view board details
- **Card Operations**: Create, read, update, and delete cards/tasks
- **Description Support**: Add and update card descriptions with full markdown support
- **Content Management**: View and manage card content blocks (descriptions, text, etc.)
- **User-Friendly**: Use human-readable column and property names (no need for IDs)
- **Auto-Authentication**: Automatically handles login and session management
- **Column Movement**: Easily move cards between columns with simple property updates

## Installation

### Option 1: Using Claude CLI (Recommended)

The easiest way to install is using the Claude CLI with npx:

```bash
claude mcp add --transport stdio focalboard \
  --env FOCALBOARD_HOST=https://your-focalboard-instance.com \
  --env FOCALBOARD_USERNAME=your-username \
  --env FOCALBOARD_PASSWORD=your-password \
  -- npx -y github:gmjuhasz/focalboard-mcp-server
```

Replace the environment variable values with your actual Focalboard credentials:
- `FOCALBOARD_HOST`: Your Focalboard instance URL (e.g., `https://focalboard.example.com`)
- `FOCALBOARD_USERNAME`: Your Focalboard username or email
- `FOCALBOARD_PASSWORD`: Your Focalboard password

Alternatively, if you've cloned the repository locally:

```bash
cd /path/to/focalboard-mcp-server
npm install
npm run build

claude mcp add --transport stdio focalboard \
  --env FOCALBOARD_HOST=https://your-focalboard-instance.com \
  --env FOCALBOARD_USERNAME=your-username \
  --env FOCALBOARD_PASSWORD=your-password \
  -- node /absolute/path/to/focalboard-mcp-server/build/index.js
```

### Option 2: Manual Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

4. Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "focalboard": {
      "command": "node",
      "args": ["/absolute/path/to/focalboard-mcp-server/build/index.js"],
      "env": {
        "FOCALBOARD_HOST": "https://your-focalboard-instance.com",
        "FOCALBOARD_USERNAME": "your-username",
        "FOCALBOARD_PASSWORD": "your-password"
      }
    }
  }
}
```

Replace `/absolute/path/to/focalboard-mcp-server` with the actual path to this project.

5. Restart Claude Desktop

## Configuration

The server supports two setups: **standalone Focalboard** (username/password login) and **Mattermost Boards** (the Focalboard plugin behind Mattermost, using a Personal Access Token).

### Standalone Focalboard

- `FOCALBOARD_HOST`: Root URL of the Focalboard server (e.g., `https://focalboard.example.com`)
- `FOCALBOARD_USERNAME`: Username or email for `POST /api/v2/login`
- `FOCALBOARD_PASSWORD`: Password for that account

Do **not** set `FOCALBOARD_TOKEN` / `MATTERMOST_ACCESS_TOKEN` when using this mode.

### Mattermost Boards (plugin)

The API is still Focalboard v2, but it is mounted under the Mattermost server. Set the host to the **plugin base** (no trailing slash), not the Mattermost root alone:

```text
https://<mattermost-host>/plugins/focalboard
```

The client appends `/api/v2/...` to that base. If you use only `https://<mattermost-host>`, requests can hit Mattermost’s core API instead of Boards.

Authentication uses a **Mattermost Personal Access Token** (Profile → Security → Personal Access Tokens). On many Mattermost deployments, Boards API requests with `Authorization: Bearer <PAT>` also require **`X-Requested-With: XMLHttpRequest`** so CSRF checks treat the call like an XHR; this server sends that header on **every** API request.

**Environment variables (token mode):**

- `FOCALBOARD_HOST`: `https://<mattermost-host>/plugins/focalboard`
- `FOCALBOARD_TOKEN` **or** `MATTERMOST_ACCESS_TOKEN`: the PAT value (`mm_pat_...`)

Username and password are optional and ignored when a token is set.

**Team ID:** For `list_boards` / `search_boards`, use the **real team id** from the Boards URL (`/boards/team/<teamId>/...`), not `"0"`.

**Example `curl` (operators):**

```bash
export TOKEN='mm_pat_...'
export HOST='https://your-mattermost.example.com/plugins/focalboard'

curl -sS -H "Authorization: Bearer ${TOKEN}" \
  -H 'Accept: application/json' \
  -H 'X-Requested-With: XMLHttpRequest' \
  "${HOST}/api/v2/users/me"
```

**Example MCP config (Cursor / Claude Desktop):**

```json
{
  "mcpServers": {
    "focalboard": {
      "command": "node",
      "args": ["/absolute/path/to/focalboard-mcp-server/build/index.js"],
      "env": {
        "FOCALBOARD_HOST": "https://your-mattermost.example.com/plugins/focalboard",
        "FOCALBOARD_TOKEN": "mm_pat_..."
      }
    }
  }
}
```

**Security:** Treat the PAT like a password. Prefer OS-level secret storage or your client’s secret mechanism for MCP `env`; this server does not log the token.

### Required environment variables (summary)

| Mode | Variables |
|------|-----------|
| Standalone | `FOCALBOARD_HOST`, `FOCALBOARD_USERNAME`, `FOCALBOARD_PASSWORD` |
| Mattermost Boards | `FOCALBOARD_HOST` (plugin base URL), `FOCALBOARD_TOKEN` or `MATTERMOST_ACCESS_TOKEN` |

## Available Tools

### Board Management

#### `list_boards`
List all boards for a team.

**Parameters:**
- `teamId` (optional): The team ID (default: "0")

**Example:**
```
List all my boards
```

#### `get_board`
Get detailed information about a specific board, including columns and properties.

**Parameters:**
- `boardId` (required): The board ID

**Example:**
```
Get details for board abc123
```

#### `search_boards`
Search for boards by name or keyword.

**Parameters:**
- `teamId` (optional): The team ID (default: "0")
- `searchTerm` (required): Search term

**Example:**
```
Search for boards with "project" in the name
```

#### `list_board_users`
List board members with **resolved usernames** (via `GET /boards/{boardId}/members` and `POST /users`). Use this when you need an Assignee but only know a Mattermost username.

**Parameters:**
- `boardId` (required): The board ID
- `search` (optional): Case-insensitive substring filter (username, email, names, user id)

**Assignee / person fields (`create_card` / `update_card`):**
- **Mattermost user ID** (26 lowercase alphanumeric characters), e.g. from `list_board_users`
- **`@username`** for a user who is a **member of that board** (exact username match, case-insensitive)
- **Several assignees:** comma-separated ids/usernames, or a JSON array string: `["id1","id2"]`

The API stores person / multiPerson values as **arrays of user IDs**; the server now sends that shape so assignees show correctly in Boards.

### Card/Task Operations

#### `create_card`
Create a new card (task) in a board with optional description.

**Parameters:**
- `boardId` (required): The board ID
- `title` (required): Card title
- `properties` (optional): Property values as key-value pairs using property names (see **Assignee** above)
- `description` (optional): Card description in markdown format

**Example:**
```
Create a card titled "Implement login feature" in board abc123 with Status "To Do" and Priority "High" and description "Add OAuth2 authentication with Google and GitHub providers"
```

#### `get_cards`
List all cards in a board.

**Parameters:**
- `boardId` (required): The board ID
- `page` (optional): Page number (default: 0)
- `perPage` (optional): Results per page (default: 100)

**Example:**
```
Get all cards from board abc123
```

#### `get_card`
Get detailed information about a specific card.

**Parameters:**
- `cardId` (required): The card ID

**Example:**
```
Get details for card xyz789
```

#### `update_card`
Update a card's properties, title, and/or description.

**Parameters:**
- `cardId` (required): The card ID
- `boardId` (required): The board ID
- `title` (optional): New title
- `properties` (optional): Property values to update using property names (see **list_board_users** / Assignee above)
- `description` (optional): Update or set the card description in markdown format

**Example:**
```
Update card xyz789 in board abc123, move it to "In Progress" status and add description "Currently implementing the authentication flow"
```

**Moving Cards Between Columns:**
To move a card to a different column, update the property that defines the columns. For example, if your board has a "Status" property with columns "To Do", "In Progress", and "Done":

```
Update card xyz789, set Status to "In Progress"
```

#### `delete_card`
Delete a card permanently.

**Parameters:**
- `cardId` (required): The card ID
- `boardId` (required): The board ID

**Example:**
```
Delete card xyz789 from board abc123
```

#### `add_card_description`
Add or update the description of an existing card.

**Parameters:**
- `cardId` (required): The card ID
- `boardId` (required): The board ID
- `description` (required): The description content in markdown format

**Example:**
```
Add description to card xyz789: "This task involves implementing user authentication with JWT tokens"
```

#### `get_card_content`
Get all content blocks (descriptions, text blocks, etc.) for a card.

**Parameters:**
- `cardId` (required): The card ID

**Example:**
```
Get the description and content of card xyz789
```

## Usage Examples

### Getting Started

1. **List your boards:**
   ```
   List all my Focalboard boards
   ```

2. **Get board details to see columns:**
   ```
   Show me the details of board [board-id], including all columns
   ```

3. **Create a new task:**
   ```
   Create a task in board [board-id] titled "Review pull request" with Status "To Do"
   ```

4. **Move a task to another column:**
   ```
   Update card [card-id] in board [board-id], change Status to "Done"
   ```

### Workflow Example

```
User: "List all my boards"
Claude: [Shows list of boards with IDs]

User: "Get details for board abc123"
Claude: [Shows board with property definitions, including Status column options]

User: "Create a card in board abc123 titled 'Fix bug in authentication' with Status 'To Do' and Priority 'High'"
Claude: [Creates card and returns the new card ID]

User: "Get all cards from board abc123"
Claude: [Shows all cards in the board]

User: "Update card xyz789, move it to 'In Progress'"
Claude: [Updates the card's Status property]
```

### Working with Descriptions

```
User: "Create a task in board abc123 titled 'Implement OAuth' with description 'Add Google and GitHub OAuth providers'"
Claude: [Creates card with description]

User: "Show me the description of card xyz789"
Claude: [Retrieves and displays the card's content blocks including the description]

User: "Update card xyz789 description to include implementation details"
Claude: [Updates the card's description]

User: "Add a description to card abc456 explaining the requirements"
Claude: [Adds a new description to an existing card]
```

**Markdown Support:**
Descriptions support full markdown formatting:
- **Bold** and *italic* text
- Lists (ordered and unordered)
- Code blocks: \`inline code\` or
  \`\`\`
  code block
  \`\`\`
- Headers (# H1, ## H2, etc.)
- Links: [text](url)
- And more!

## How It Works

### Authentication

**Standalone:** On first API use, the client calls `POST /api/v2/login` with username/password, stores the session token, sends `Authorization: Bearer` and `X-Requested-With: XMLHttpRequest` on subsequent requests, and retries login once after a `401`.

**Mattermost Boards:** If `FOCALBOARD_TOKEN` or `MATTERMOST_ACCESS_TOKEN` is set, login is skipped; the PAT is sent as `Authorization: Bearer` on every request, with the same CSRF-related header. A `401` is not retried with password login.

### Column Name Resolution

When you update a card with property names (e.g., "Status": "In Progress"):
1. The server fetches the board details
2. Finds the property by name (case-insensitive)
3. Resolves the column/option name to its internal ID
4. Updates the card with the correct ID

This means you can use friendly names like "To Do" instead of remembering cryptic IDs like "option-abc123".

## API Reference

This server uses the Focalboard API v2. For more details, see:
- [Focalboard API Documentation](https://htmlpreview.github.io/?https://github.com/mattermost/focalboard/blob/main/server/swagger/docs/html/index.html)
- [Focalboard GitHub Repository](https://github.com/mattermost-community/focalboard)

## Troubleshooting

### Authentication Errors

If you see authentication errors:
- Verify your `FOCALBOARD_HOST` is correct (should include `https://`)
- Check your username and password are correct
- Ensure your Focalboard instance is accessible

### Board or Card Not Found

- Use `list_boards` to get the correct board IDs
- Use `get_cards` to get valid card IDs
- Board and card IDs are case-sensitive

### Property Not Found

- Use `get_board` to see all available properties and their names
- Property names are case-insensitive but must match exactly
- For select/multiSelect properties, option values must match available options

## Development

### Project Structure

```
focalboard-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── focalboard-client.ts  # Focalboard API client
│   └── types.ts              # TypeScript type definitions
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Watch Mode

For development with auto-rebuild:

```bash
npm run watch
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Related Projects

- [Focalboard](https://github.com/mattermost-community/focalboard) - Open source project management tool
- [Model Context Protocol](https://github.com/anthropics/mcp) - Protocol for AI-application integration
