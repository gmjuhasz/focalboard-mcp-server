import fetch, { Response } from 'node-fetch';
import {
  FocalboardConfig,
  LoginRequest,
  LoginResponse,
  Board,
  BoardMember,
  BoardUserRow,
  Card,
  CardPatch,
  PropertyTemplate,
  ErrorResponse,
  Block,
  Team,
  User,
} from './types.js';

export class FocalboardClient {
  private host: string;
  private username: string;
  private password: string;
  /** Non-null when using Mattermost PAT (or other pre-provisioned Bearer token). */
  private readonly pat: string | null;
  private sessionToken: string | null = null;
  private readonly apiBasePath = '/api/v2';

  constructor(config: FocalboardConfig) {
    // Ensure host doesn't have trailing slash
    this.host = config.host.replace(/\/$/, '');
    const trimmedPat = config.accessToken?.trim();
    this.pat = trimmedPat && trimmedPat.length > 0 ? trimmedPat : null;
    this.username = config.username ?? '';
    this.password = config.password ?? '';
    if (this.pat) {
      this.sessionToken = this.pat;
    }
  }

  private isPatMode(): boolean {
    return this.pat !== null;
  }

  /**
   * Login and get session token
   */
  private async login(): Promise<void> {
    if (this.isPatMode()) {
      throw new Error('login() must not be called in access-token (Mattermost PAT) mode');
    }
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
    if (this.isPatMode()) {
      this.sessionToken = this.pat;
      return;
    }
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

    // Handle 401 — password mode may refresh session; PAT mode must not call login()
    if (response.status === 401) {
      if (this.isPatMode()) {
        return this.handleResponse<T>(response);
      }
      this.sessionToken = null;
      await this.login();

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
   * List teams the current user can access (Mattermost: all member teams; standalone: root team(s)).
   */
  async listTeams(): Promise<Team[]> {
    return this.makeRequest<Team[]>('/teams');
  }

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
   * Board members (roles only). Use {@link listBoardUsers} for usernames.
   */
  async getBoardMembers(boardId: string): Promise<BoardMember[]> {
    return this.makeRequest<BoardMember[]>(`/boards/${boardId}/members`);
  }

  /**
   * Resolve user profiles for a list of Mattermost / Focalboard user IDs.
   */
  async getUsersByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.makeRequest<User[]>('/users', 'POST', userIds);
  }

  /**
   * Members of a board with usernames (and optional substring filter).
   */
  async listBoardUsers(boardId: string, query?: string): Promise<BoardUserRow[]> {
    const members = await this.getBoardMembers(boardId);
    const userIds = [
      ...new Set(
        members
          .map((m) => (m as { userId?: string; user_id?: string }).userId ?? (m as { user_id?: string }).user_id)
          .filter(Boolean) as string[]
      ),
    ];
    let users: User[] = [];
    if (userIds.length > 0) {
      users = await this.getUsersByIds(userIds);
    }
    const byId = new Map(users.map((u) => [u.id, u]));
    const needle = (query ?? '').trim().toLowerCase();
    const rows: BoardUserRow[] = members.map((m) => {
      const userId =
        (m as { userId?: string; user_id?: string }).userId ?? (m as { user_id?: string }).user_id ?? '';
      const u = userId ? byId.get(userId) : undefined;
      return {
        userId,
        username: u?.username ?? '',
        email: u?.email ?? '',
        firstname: u?.firstname ?? '',
        lastname: u?.lastname ?? '',
        nickname: u?.nickname ?? '',
        schemeAdmin: !!m.schemeAdmin,
        schemeEditor: !!m.schemeEditor,
        schemeCommenter: !!m.schemeCommenter,
        schemeViewer: !!m.schemeViewer,
      };
    });
    if (!needle) {
      return rows;
    }
    return rows.filter((r) => {
      const hay = [r.userId, r.username, r.email, r.firstname, r.lastname, r.nickname].join(' ').toLowerCase();
      return hay.includes(needle);
    });
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
   * Reads card custom properties from API shape (`fields.properties` or top-level `properties`).
   * Focalboard PATCH replaces the whole `properties` map when only a subset is sent, so callers merge here.
   */
  private getCardPropertiesSnapshot(card: Card): Record<string, string | string[]> {
    const fromFields = card.fields?.properties;
    if (fromFields && typeof fromFields === 'object' && !Array.isArray(fromFields)) {
      return { ...(fromFields as Record<string, string | string[]>) };
    }
    const top = (card as unknown as { properties?: Record<string, string | string[]> }).properties;
    if (top && typeof top === 'object' && !Array.isArray(top)) {
      return { ...top };
    }
    return {};
  }

  /**
   * Update a card
   */
  async updateCard(boardId: string, cardId: string, patch: CardPatch): Promise<Card> {
    const incoming = patch.updatedFields?.properties;
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      const current = await this.getCard(cardId);
      const merged = {
        ...this.getCardPropertiesSnapshot(current),
        ...(incoming as Record<string, string | string[]>),
      };
      patch = {
        ...patch,
        updatedFields: {
          ...patch.updatedFields,
          properties: merged,
        },
      };
    }

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
   * Mattermost-style user IDs used by Boards are typically 26 lowercase alphanumerics.
   */
  private looksLikeMattermostUserId(token: string): boolean {
    const t = token.trim();
    return /^[a-z0-9]{26}$/.test(t);
  }

  /**
   * Split person / multiPerson property value into raw tokens (IDs or @username / username).
   */
  private parsePersonPropertyTokens(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return (parsed as unknown[]).map((x) => String(x).trim()).filter(Boolean);
        }
        return [String(parsed).trim()];
      } catch {
        throw new Error(
          `Invalid JSON for person property: expected a JSON array of user IDs or usernames`
        );
      }
    }
    return trimmed.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  }

  private resolvePersonTokenToUserId(token: string, boardUsers: BoardUserRow[]): string {
    const t = token.trim();
    if (!t) {
      throw new Error('Empty person / assignee token');
    }
    if (this.looksLikeMattermostUserId(t)) {
      return t;
    }
    const uname = t.replace(/^@/, '').toLowerCase();
    const matches = boardUsers.filter((row) => row.username.toLowerCase() === uname);
    if (matches.length === 1) {
      return matches[0].userId;
    }
    if (matches.length === 0) {
      throw new Error(
        `No board member with username "${uname}". Use list_board_users, or pass the Mattermost user ID (26 chars).`
      );
    }
    throw new Error(`Ambiguous username "${uname}"`);
  }

  private resolvePersonPropertyValue(
    value: string,
    multi: boolean,
    boardUsers: BoardUserRow[]
  ): string[] {
    const tokens = this.parsePersonPropertyTokens(value);
    if (tokens.length === 0) {
      throw new Error('Person property requires at least one user ID or @username');
    }
    if (!multi && tokens.length > 1) {
      throw new Error('Person property accepts only one user (use multiPerson / Assignee for several users)');
    }
    const toResolve = multi ? tokens : tokens.slice(0, 1);
    return toResolve.map((tok) => this.resolvePersonTokenToUserId(tok, boardUsers));
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
    const propertyUpdates: Record<string, string | string[]> = {};

    const needsBoardUsers = Object.keys(properties).some((propName) => {
      const property = this.findPropertyByName(board, propName);
      return property?.type === 'multiPerson' || property?.type === 'person';
    });
    const boardUsers = needsBoardUsers ? await this.listBoardUsers(boardId) : [];

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
      } else if (property.type === 'multiPerson') {
        propertyUpdates[property.id] = this.resolvePersonPropertyValue(value, true, boardUsers);
      } else if (property.type === 'person') {
        const ids = this.resolvePersonPropertyValue(value, false, boardUsers);
        propertyUpdates[property.id] = ids[0];
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
