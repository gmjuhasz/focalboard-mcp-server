# Focalboard MCP Server

A Model Context Protocol (MCP) server for [Focalboard](https://github.com/mattermost-community/focalboard), enabling task and board management through Claude and other MCP-compatible clients.

## Features

- **Board Management**: List, search, and view board details
- **Card Operations**: Create, read, update, and delete cards/tasks
- **User-Friendly**: Use human-readable column and property names (no need for IDs)
- **Auto-Authentication**: Automatically handles login and session management
- **Column Movement**: Easily move cards between columns with simple property updates

## Installation

### Option 1: Using Claude CLI (Recommended)

The easiest way to install is using the Claude CLI:

```bash
# From local directory
claude mcp add /path/to/focalboard-mcp-server

# Or from GitHub (once published)
claude mcp add https://github.com/yourusername/focalboard-mcp-server
```

After adding, you'll be prompted to configure the environment variables:
- `FOCALBOARD_HOST`: Your Focalboard instance URL (e.g., `https://focalboard.example.com`)
- `FOCALBOARD_USERNAME`: Your Focalboard username or email
- `FOCALBOARD_PASSWORD`: Your Focalboard password

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

### Required Environment Variables

- `FOCALBOARD_HOST`: The URL of your Focalboard instance (e.g., `https://focalboard.example.com`)
- `FOCALBOARD_USERNAME`: Your Focalboard username or email
- `FOCALBOARD_PASSWORD`: Your Focalboard password

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

### Card/Task Operations

#### `create_card`
Create a new card (task) in a board.

**Parameters:**
- `boardId` (required): The board ID
- `title` (required): Card title
- `properties` (optional): Property values as key-value pairs using property names

**Example:**
```
Create a card titled "Implement login feature" in board abc123 with Status "To Do" and Priority "High"
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
Update a card's properties, including moving it between columns.

**Parameters:**
- `cardId` (required): The card ID
- `boardId` (required): The board ID
- `title` (optional): New title
- `properties` (optional): Property values to update using property names

**Example:**
```
Update card xyz789 in board abc123, move it to "In Progress" status
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

## How It Works

### Authentication

The server automatically handles authentication:
1. When first called, it logs in with your username/password
2. Receives a session token from Focalboard
3. Uses the token for all subsequent API requests
4. Automatically re-authenticates if the token expires

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
