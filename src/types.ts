/**
 * Focalboard API Types
 * Based on: https://htmlpreview.github.io/?https://github.com/mattermost/focalboard/blob/main/server/swagger/docs/html/index.html
 */

export interface FocalboardConfig {
  host: string;
  /** Standalone Focalboard: username for POST /api/v2/login. Ignored when accessToken is set. */
  username?: string;
  /** Standalone Focalboard: password for POST /api/v2/login. Ignored when accessToken is set. */
  password?: string;
  /**
   * Mattermost Boards (plugin): Personal Access Token (or equivalent Bearer token).
   * When set, login is skipped and this value is sent as Authorization Bearer on every request.
   */
  accessToken?: string;
}

export interface LoginRequest {
  type: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface ErrorResponse {
  error: string;
  errorCode?: number;
}

// Block is the base type for all Focalboard entities
export interface Block {
  id: string;
  boardId: string;
  parentId: string;
  createdBy: string;
  modifiedBy: string;
  schema: number;
  type: string; // 'board', 'card', 'view', 'text', 'image', 'comment', etc.
  title: string;
  fields: Record<string, any>;
  createAt: number;
  updateAt: number;
  deleteAt: number;
  limited: boolean;
}

// Board represents a Focalboard board
export interface Board {
  id: string;
  teamId: string;
  channelId: string;
  createdBy: string;
  modifiedBy: string;
  type: string; // 'O' (open) or 'P' (private)
  minimumRole: string;
  title: string;
  description: string;
  icon: string;
  showDescription: boolean;
  isTemplate: boolean;
  templateVersion: number;
  properties: Record<string, any>;
  cardProperties: PropertyTemplate[];
  createAt: number;
  updateAt: number;
  deleteAt: number;
}

// PropertyTemplate defines the schema for card properties (columns)
export interface PropertyTemplate {
  id: string;
  name: string;
  type: string; // 'text', 'number', 'select', 'multiSelect', 'date', 'person', etc.
  options?: PropertyOption[];
}

// PropertyOption represents an option for select/multiSelect properties
export interface PropertyOption {
  id: string;
  value: string;
  color: string;
}

// Card represents a task/card in a board
export interface Card extends Block {
  type: 'card';
  fields: {
    properties: Record<string, string | string[]>; // Property values
    contentOrder: string[]; // IDs of content blocks
    icon?: string;
    [key: string]: any;
  };
}

// CardPatch is used to update cards
export interface CardPatch {
  parentId?: string;
  schema?: number;
  type?: string;
  title?: string;
  updatedFields?: Record<string, any>;
  deletedFields?: string[];
}

// BoardMember represents a user's membership in a board
export interface BoardMember {
  boardId: string;
  userId: string;
  roles: string;
  minimumRole: string;
  schemeAdmin: boolean;
  schemeEditor: boolean;
  schemeCommenter: boolean;
  schemeViewer: boolean;
  synthetic: boolean;
}

// Team represents a Focalboard team
export interface Team {
  id: string;
  title: string;
  signupToken: string;
  settings: Record<string, any>;
  modifiedBy: string;
  updateAt: number;
}

// SearchBoardsRequest for board search
export interface SearchBoardsRequest {
  term: string;
  field?: string;
}

// User information
export interface User {
  id: string;
  username: string;
  email: string;
  nickname: string;
  firstname: string;
  lastname: string;
  create_at: number;
  update_at: number;
  delete_at: number;
}
