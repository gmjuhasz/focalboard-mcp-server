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
const config: FocalboardConfig = {
  host: process.env.FOCALBOARD_HOST || '',
  username: process.env.FOCALBOARD_USERNAME || '',
  password: process.env.FOCALBOARD_PASSWORD || ''
};

// Validate configuration
if (!config.host || !config.username || !config.password) {
  console.error('Error: Missing required environment variables');
  console.error('Required: FOCALBOARD_HOST, FOCALBOARD_USERNAME, FOCALBOARD_PASSWORD');
  process.exit(1);
}

// Initialize Focalboard client
const focalboard = new FocalboardClient(config);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'list_boards',
    description: 'List all boards for a team. Returns an array of boards with their IDs, titles, and properties.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'The team ID to list boards for (default: "0" for default team)',
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
          description: 'The team ID to search within (default: "0" for default team)',
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
          description: 'Property values for the card (e.g., {"Status": "To Do", "Priority": "High"}). Use property names, not IDs.',
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
          description: 'Property values to update (e.g., {"Status": "In Progress", "Priority": "High"}). Use property names, not IDs.',
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
