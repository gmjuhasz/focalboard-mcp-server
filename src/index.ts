#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { FocalboardClient } from './focalboard-client.js';
import { FocalboardConfig } from './types.js';

// Get configuration from environment variables
const host = (process.env.FOCALBOARD_HOST || '').trim();
const accessToken = (
  process.env.FOCALBOARD_TOKEN ||
  process.env.MATTERMOST_ACCESS_TOKEN ||
  ''
).trim();
const username = (process.env.FOCALBOARD_USERNAME || '').trim();
const password = (process.env.FOCALBOARD_PASSWORD || '').trim();

const config: FocalboardConfig = accessToken
  ? { host, accessToken }
  : { host, username, password };

// Validate configuration
if (!host) {
  console.error('Error: FOCALBOARD_HOST is required');
  process.exit(1);
}

if (accessToken) {
  // Mattermost Boards / PAT mode: host + token only
} else if (!username || !password) {
  console.error('Error: Missing credentials for standalone Focalboard');
  console.error(
    'Set FOCALBOARD_USERNAME and FOCALBOARD_PASSWORD, or use FOCALBOARD_TOKEN (or MATTERMOST_ACCESS_TOKEN) for Mattermost Boards.'
  );
  process.exit(1);
}

// Initialize Focalboard client
const focalboard = new FocalboardClient(config);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'list_teams',
    description:
      'List teams the authenticated user can access. Each item includes `id` (use as `teamId` for list_boards / search_boards) and `title`. Optional `titleContains` filters by team name.',
    inputSchema: {
      type: 'object',
      properties: {
        titleContains: {
          type: 'string',
          description: 'Optional case-insensitive substring; only teams whose title matches are returned.',
        },
      },
    },
  },
  {
    name: 'list_boards',
    description:
      'List all boards for a team. Returns an array of boards with their IDs, titles, and properties. On Mattermost Boards, call list_teams first to get `teamId`, or take it from the board URL (/boards/team/<teamId>/...).',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description:
            'Team ID: use "0" for standalone Focalboard default team; for Mattermost Boards use `id` from list_teams or the board URL (/boards/team/<teamId>/...).',
          default: '0'
        }
      }
    }
  },
  {
    name: 'get_board',
    description: 'Get detailed information about a specific board, including all its columns and property definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'The ID of the board to retrieve'
        }
      },
      required: ['boardId']
    }
  },
  {
    name: 'search_boards',
    description: 'Search for boards by name or keyword within a team.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description:
            'Team ID: "0" for standalone default team; Mattermost Boards: use `id` from list_teams or the board URL.',
          default: '0'
        },
        searchTerm: {
          type: 'string',
          description: 'The search term to find boards'
        }
      },
      required: ['searchTerm']
    }
  },
  {
    name: 'list_board_users',
    description:
      'List users who are members of a board with usernames, emails, and role flags. Optional `search` filters by substring (username, email, name, user id). Use this to resolve Assignee / Reviewer without pasting Mattermost user IDs. Person fields also accept `@username` or a 26-char user id.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'The board ID (same as get_board / create_card).',
        },
        search: {
          type: 'string',
          description:
            'Optional case-insensitive substring; filters the list (username, email, first/last name, nickname, userId).',
        },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'create_card',
    description: 'Create a new card (task) in a board. You can set the title, properties, description, and column placement.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'The ID of the board to create the card in'
        },
        title: {
          type: 'string',
          description: 'The title/name of the card'
        },
        properties: {
          type: 'object',
          description:
            'Property values for the card (e.g., {"Status": "To Do", "Priority": "High", "Assignee": "@sara"}). Use property names, not IDs. For Assignee / person fields: Mattermost user id (26 chars), @username of a board member, comma-separated ids, or JSON array ["id1","id2"].',
          additionalProperties: {
            type: 'string'
          }
        },
        description: {
          type: 'string',
          description: 'Optional description/content for the card in markdown format'
        }
      },
      required: ['boardId', 'title']
    }
  },
  {
    name: 'get_cards',
    description: 'List all cards (tasks) in a board with pagination support.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'The ID of the board to list cards from'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 0)',
          default: 0
        },
        perPage: {
          type: 'number',
          description: 'Number of cards per page (default: 100)',
          default: 100
        }
      },
      required: ['boardId']
    }
  },
  {
    name: 'get_card',
    description: 'Get detailed information about a specific card by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The ID of the card to retrieve'
        }
      },
      required: ['cardId']
    }
  },
  {
    name: 'update_card',
    description: 'Update a card\'s properties, including moving it to different columns. Accepts human-readable property and column names.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The ID of the card to update'
        },
        boardId: {
          type: 'string',
          description: 'The ID of the board the card belongs to'
        },
        title: {
          type: 'string',
          description: 'New title for the card (optional)'
        },
        properties: {
          type: 'object',
          description:
            'Property values to update (e.g., {"Status": "In Progress", "Assignee": "@mohammad"}). Use property names, not IDs. Assignee / person: user id, @username (board member), comma-separated, or JSON array.',
          additionalProperties: {
            type: 'string'
          }
        },
        description: {
          type: 'string',
          description: 'Update or set the description/content for the card in markdown format (optional)'
        }
      },
      required: ['cardId', 'boardId']
    }
  },
  {
    name: 'delete_card',
    description: 'Delete a card (task) from a board permanently.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The ID of the card to delete'
        },
        boardId: {
          type: 'string',
          description: 'The ID of the board the card belongs to'
        }
      },
      required: ['cardId', 'boardId']
    }
  },
  {
    name: 'add_card_description',
    description: 'Add or set description/content to a card. Creates a new text block with markdown content.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The ID of the card to add description to'
        },
        boardId: {
          type: 'string',
          description: 'The ID of the board the card belongs to'
        },
        description: {
          type: 'string',
          description: 'The description content in markdown format'
        }
      },
      required: ['cardId', 'boardId', 'description']
    }
  },
  {
    name: 'get_card_content',
    description: 'Get all content blocks (descriptions) for a card.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The ID of the card to get content for'
        }
      },
      required: ['cardId']
    }
  }
];

// Create MCP server
const server = new Server(
  {
    name: 'focalboard-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      // ====================
      // Board Tools
      // ====================

      case 'list_teams': {
        const needle = ((args?.titleContains as string) || '').trim().toLowerCase();
        let teams = await focalboard.listTeams();
        if (needle) {
          teams = teams.filter((t) => (t.title || '').toLowerCase().includes(needle));
        }
        const safe = teams.map((t) => ({
          id: t.id,
          title: t.title,
          updateAt: t.updateAt,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(safe, null, 2),
            },
          ],
        };
      }

      case 'list_boards': {
        const teamId = (args?.teamId as string) || '0';
        const boards = await focalboard.listBoards(teamId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(boards, null, 2)
            }
          ]
        };
      }

      case 'get_board': {
        const boardId = args?.boardId as string;
        if (!boardId) {
          throw new Error('boardId is required');
        }
        const board = await focalboard.getBoard(boardId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(board, null, 2)
            }
          ]
        };
      }

      case 'search_boards': {
        const teamId = (args?.teamId as string) || '0';
        const searchTerm = args?.searchTerm as string;
        if (!searchTerm) {
          throw new Error('searchTerm is required');
        }
        const boards = await focalboard.searchBoards(teamId, searchTerm);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(boards, null, 2)
            }
          ]
        };
      }

      case 'list_board_users': {
        const boardId = args?.boardId as string;
        const search = (args?.search as string) || undefined;
        if (!boardId) {
          throw new Error('boardId is required');
        }
        const rows = await focalboard.listBoardUsers(boardId, search);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      // ====================
      // Card Tools
      // ====================

      case 'create_card': {
        const boardId = args?.boardId as string;
        const title = args?.title as string;
        const properties = (args?.properties as Record<string, string>) || {};
        const description = args?.description as string | undefined;

        if (!boardId || !title) {
          throw new Error('boardId and title are required');
        }

        // Create the card first
        const cardData: any = {
          title,
          fields: {
            properties: {},
            contentOrder: []
          }
        };

        let card = await focalboard.createCard(boardId, cardData);

        // If properties are provided, update the card with them
        if (Object.keys(properties).length > 0) {
          card = await focalboard.updateCardProperties(card.id, boardId, properties);
        }

        // If description is provided, add it as a text block
        if (description) {
          await focalboard.createTextBlock(boardId, card.id, description);
          // Refresh card to get updated contentOrder
          card = await focalboard.getCard(card.id);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2)
            }
          ]
        };
      }

      case 'get_cards': {
        const boardId = args?.boardId as string;
        const page = (args?.page as number) || 0;
        const perPage = (args?.perPage as number) || 100;

        if (!boardId) {
          throw new Error('boardId is required');
        }

        const cards = await focalboard.getCards(boardId, page, perPage);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cards, null, 2)
            }
          ]
        };
      }

      case 'get_card': {
        const cardId = args?.cardId as string;
        if (!cardId) {
          throw new Error('cardId is required');
        }
        const card = await focalboard.getCard(cardId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2)
            }
          ]
        };
      }

      case 'update_card': {
        const cardId = args?.cardId as string;
        const boardId = args?.boardId as string;
        const title = args?.title as string;
        const properties = (args?.properties as Record<string, string>) || {};
        const description = args?.description as string | undefined;

        if (!cardId || !boardId) {
          throw new Error('cardId and boardId are required');
        }

        if (!title && Object.keys(properties).length === 0 && !description) {
          throw new Error('Either title, properties, or description must be provided');
        }

        let card;

        // Update title if provided
        if (title) {
          card = await focalboard.updateCard(boardId, cardId, { title });
        }

        // Update properties if provided
        if (Object.keys(properties).length > 0) {
          card = await focalboard.updateCardProperties(cardId, boardId, properties);
        }

        // Update description if provided
        if (description) {
          await focalboard.setCardDescription(boardId, cardId, description);
        }

        // Fetch the updated card
        card = await focalboard.getCard(cardId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2)
            }
          ]
        };
      }

      case 'delete_card': {
        const cardId = args?.cardId as string;
        const boardId = args?.boardId as string;

        if (!cardId || !boardId) {
          throw new Error('cardId and boardId are required');
        }

        await focalboard.deleteCard(boardId, cardId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Card deleted successfully' })
            }
          ]
        };
      }

      case 'add_card_description': {
        const cardId = args?.cardId as string;
        const boardId = args?.boardId as string;
        const description = args?.description as string;

        if (!cardId || !boardId || !description) {
          throw new Error('cardId, boardId, and description are required');
        }

        await focalboard.setCardDescription(boardId, cardId, description);
        const card = await focalboard.getCard(cardId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2)
            }
          ]
        };
      }

      case 'get_card_content': {
        const cardId = args?.cardId as string;

        if (!cardId) {
          throw new Error('cardId is required');
        }

        const contentBlocks = await focalboard.getCardContent(cardId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(contentBlocks, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Focalboard MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
