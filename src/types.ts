// Shared types for the playground.
//
// The ThoughtSpot SDK is loaded dynamically from a CDN (see sdk.ts), so we describe
// only the surface we use rather than depending on the published package types —
// this keeps the app decoupled from any single SDK version.

export interface AuthEventEmitter {
  on(event: string, cb: (payload?: unknown) => void): AuthEventEmitter;
}

export interface EmbedInstance {
  on(event: string, cb: (payload?: unknown) => void): EmbedInstance;
  render(): unknown;
  destroy?(): void;
  navigateToLiveboard?(liveboardId: string, ...rest: unknown[]): unknown;
}

/** The dynamically-loaded SDK module. Loosely typed on purpose. */
export interface SDKModule {
  init(config: EmbedConfig): AuthEventEmitter;
  logout(): Promise<unknown>;
  AuthType: Record<string, string>;
  AuthStatus: Record<string, string>;
  EmbedEvent: Record<string, string>;
  HostEvent?: Record<string, string>;
  // Embed classes: LiveboardEmbed, SearchEmbed, SearchBarEmbed, AppEmbed, SpotterEmbed…
  [name: string]: unknown;
}

export interface EmbedConfig {
  thoughtSpotHost: string;
  authType: string;
  suppressNoCookieAccessAlert?: boolean;
  detectCookieAccessSlow?: boolean;
  disableLoginRedirect?: boolean;
  logLevel?: string;
  username?: string;
  password?: string;
  getAuthToken?: () => Promise<string>;
  authEndpoint?: string;
  [key: string]: unknown;
}

export interface AuthMeta {
  label: string;
  hint: string;
}

declare global {
  interface Window {
    tsEmbed?: EmbedInstance;
    TsEmbedSDK?: SDKModule;
  }
}
