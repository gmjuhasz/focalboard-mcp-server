import fetch, { Response } from 'node-fetch';
import {
  FocalboardConfig,
  LoginRequest,
  LoginResponse,
  Board,
  Card,
  CardPatch,
  PropertyTemplate,
  ErrorResponse,
  Block
} from './types.js';

export class FocalboardClient {
  private host: string;
  private username: string;
  private password: string;
  private sessionToken: string | null = null;
  private readonly apiBasePath = '/api/v2';

  constructor(config: FocalboardConfig) {
    // Ensure host doesn't have trailing slash
    this.host = config.host.replace(/\/$/, '');
    this.username = config.username;
    this.password = config.password;
  }

  /**
   * Login and get session token
   */
  private async login(): Promise<void> {
    const loginPayload: LoginRequest = {
      type: 'normal',
      username: this.username,
      email: this.username,
      password: this.password
    };

    const response = await fetch(`${this.host}${this.apiBasePath}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(loginPayload)
    });

    if (!response.ok) {
      const error = await response.json() as ErrorResponse;
      throw new Error(`Login failed: ${error.error || response.statusText}`);
    }

    const data = await response.json() as LoginResponse;
    this.sessionToken = data.token;
  }

  /**
   * Ensure we have a valid session token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.sessionToken) {
      await this.login();
    }
  }

  /**
   * Make an authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    queryParams?: Record<string, string>
  ): Promise<T> {
    await this.ensureAuthenticated();

    let url = `${this.host}${this.apiBasePath}${endpoint}`;

    // Add query parameters if provided
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.sessionToken}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json'
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    // Handle 401 - try to re-authenticate once
    if (response.status === 401) {
      this.sessionToken = null;
      await this.login();

      // Retry the request with new token
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
      const retryResponse = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      return this.handleResponse<T>(retryResponse);
    }

    return this.handleResponse<T>(response);
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const error = await response.json() as ErrorResponse;
        errorMessage = error.error || errorMessage;
      } catch {
        // If JSON parsing fails, use statusText
      }
      throw new Error(`API request failed: ${errorMessage}`);
    }

    // Handle empty responses
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ====================
  // Board Operations
  // ====================

  /**
   * List all boards for a team
   */
  async listBoards(teamId: string = '0'): Promise<Board[]> {
    return this.makeRequest<Board[]>(`/teams/${teamId}/boards`);
  }

  /**
   * Get a specific board by ID
   */
  async getBoard(boardId: string): Promise<Board> {
    return this.makeRequest<Board>(`/boards/${boardId}`);
  }

  /**
   * Search boards within a team
   */
  async searchBoards(teamId: string, term: string): Promise<Board[]> {
    return this.makeRequest<Board[]>(
      `/teams/${teamId}/boards/search`,
      'GET',
      undefined,
      { q: term }
    );
  }

  /**
   * Find a property template by name (case-insensitive)
   */
  findPropertyByName(board: Board, propertyName: string): PropertyTemplate | undefined {
    return board.cardProperties.find(
      prop => prop.name.toLowerCase() === propertyName.toLowerCase()
    );
  }

  /**
   * Find a property option by value (case-insensitive)
   */
  findPropertyOption(property: PropertyTemplate, optionValue: string): string | undefined {
    if (!property.options) return undefined;

    const option = property.options.find(
      opt => opt.value.toLowerCase() === optionValue.toLowerCase()
    );
    return option?.id;
  }

  // ====================
  // Card Operations
  // ====================

  /**
   * List all cards for a board
   */
  async getCards(boardId: string, page: number = 0, perPage: number = 100): Promise<Card[]> {
    return this.makeRequest<Card[]>(
      `/boards/${boardId}/cards`,
      'GET',
      undefined,
      { page: page.toString(), per_page: perPage.toString() }
    );
  }

  /**
   * Get a specific card by ID
   */
  async getCard(cardId: string): Promise<Card> {
    return this.makeRequest<Card>(`/cards/${cardId}`);
  }

  /**
   * Create a new card in a board
   */
  async createCard(boardId: string, card: Partial<Card>): Promise<Card> {
    const newCard = {
      boardId,
      parentId: card.parentId || boardId,
      type: 'card',
      schema: 1,
      title: card.title || '',
      fields: card.fields || {
        properties: {},
        contentOrder: [],
        icon: '',
        isTemplate: false
      },
      createAt: Date.now(),
      updateAt: Date.now(),
      deleteAt: 0,
      createdBy: '',
      modifiedBy: '',
      limited: false
    };

    // The /blocks endpoint expects an array and returns an array
    const createdCards = await this.makeRequest<Card[]>(
      `/boards/${boardId}/blocks`,
      'POST',
      [newCard]
    );

    // Return the first (and only) created card
    return createdCards[0];
  }

  /**
   * Update a card
   */
  async updateCard(boardId: string, cardId: string, patch: CardPatch): Promise<Card> {
    await this.makeRequest<void>(
      `/boards/${boardId}/blocks/${cardId}`,
      'PATCH',
      patch
    );

    // Fetch and return the updated card since PATCH returns empty
    return this.getCard(cardId);
  }

  /**
   * Delete a card
   */
  async deleteCard(boardId: string, cardId: string): Promise<void> {
    await this.makeRequest<void>(
      `/boards/${boardId}/blocks/${cardId}`,
      'DELETE'
    );
  }

  /**
   * Move a card to a different column (by column name)
   * This is a helper method that resolves column names to property option IDs
   */
  async moveCardToColumn(
    cardId: string,
    boardId: string,
    propertyName: string,
    columnName: string
  ): Promise<Card> {
    // Get board to find property and option IDs
    const board = await this.getBoard(boardId);

    // Find the property by name
    const property = this.findPropertyByName(board, propertyName);
    if (!property) {
      throw new Error(`Property '${propertyName}' not found on board`);
    }

    // Find the option by value
    const optionId = this.findPropertyOption(property, columnName);
    if (!optionId) {
      throw new Error(`Column '${columnName}' not found in property '${propertyName}'`);
    }

    // Update the card
    const patch: CardPatch = {
      updatedFields: {
        properties: {
          [property.id]: optionId
        }
      }
    };

    return this.updateCard(boardId, cardId, patch);
  }

  /**
   * Update card properties with friendly names
   * Accepts property names and values, resolves to IDs internally
   */
  async updateCardProperties(
    cardId: string,
    boardId: string,
    properties: Record<string, string>
  ): Promise<Card> {
    const board = await this.getBoard(boardId);
    const propertyUpdates: Record<string, string> = {};

    for (const [propName, value] of Object.entries(properties)) {
      const property = this.findPropertyByName(board, propName);
      if (!property) {
        throw new Error(`Property '${propName}' not found on board`);
      }

      // For select/multiSelect types, resolve option ID
      if (property.type === 'select' || property.type === 'multiSelect') {
        const optionId = this.findPropertyOption(property, value);
        if (!optionId) {
          throw new Error(`Option '${value}' not found in property '${propName}'`);
        }
        propertyUpdates[property.id] = optionId;
      } else {
        // For other types, use the value directly
        propertyUpdates[property.id] = value;
      }
    }

    const patch: CardPatch = {
      updatedFields: {
        properties: propertyUpdates
      }
    };

    return this.updateCard(boardId, cardId, patch);
  }

  /**
   * Create a text block (description) for a card
   * Returns the created text block
   */
  async createTextBlock(boardId: string, cardId: string, text: string): Promise<Block> {
    const textBlock = {
      boardId,
      parentId: cardId,
      type: 'text',
      schema: 1,
      title: text,
      fields: {},
      createAt: Date.now(),
      updateAt: Date.now(),
      deleteAt: 0,
      createdBy: '',
      modifiedBy: '',
      limited: false
    };

    // Create the text block
    const createdBlocks = await this.makeRequest<Block[]>(
      `/boards/${boardId}/blocks`,
      'POST',
      [textBlock]
    );

    const createdBlock = createdBlocks[0];

    // Get the current card to update its contentOrder
    const card = await this.getCard(cardId);
    const contentOrder = (card.fields?.contentOrder || []) as string[];
    contentOrder.push(createdBlock.id);

    // Update the card's contentOrder
    await this.updateCard(boardId, cardId, {
      updatedFields: {
        contentOrder
      }
    });

    return createdBlock;
  }

  /**
   * Get all content blocks (text blocks, etc.) for a card
   */
  async getCardContent(cardId: string): Promise<Block[]> {
    const card = await this.getCard(cardId);

    // Fetch blocks with parent_id parameter
    const blocks = await this.makeRequest<Block[]>(
      `/boards/${card.boardId}/blocks`,
      'GET',
      undefined,
      { parent_id: cardId }
    );

    return blocks;
  }

  /**
   * Update or set the description of a card
   * If a text block already exists, it updates it; otherwise creates a new one
   */
  async setCardDescription(boardId: string, cardId: string, description: string): Promise<Block> {
    // Get existing content blocks
    const contentBlocks = await this.getCardContent(cardId);
    const textBlocks = contentBlocks.filter(block => block.type === 'text');

    if (textBlocks.length > 0) {
      // Update the first text block directly
      const textBlock = textBlocks[0];
      await this.makeRequest<void>(
        `/boards/${boardId}/blocks/${textBlock.id}`,
        'PATCH',
        { title: description }
      );

      // Fetch and return the updated block
      const updatedBlocks = await this.makeRequest<Block[]>(
        `/boards/${boardId}/blocks`,
        'GET',
        undefined,
        { block_id: textBlock.id }
      );
      return updatedBlocks[0];
    } else {
      // Create a new text block
      return this.createTextBlock(boardId, cardId, description);
    }
  }
}
