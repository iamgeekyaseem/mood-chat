export type Role = "user" | "assistant";
export type ContextMode = "minimal" | "path" | "full";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface Node {
  id: string;
  parent_id: string | null;
  role: Role;
  content: string;
  created_at: number;
  model: string | null;
  provider: string | null;
  anchor_text: string | null;
  anchor_node_id: string | null;
  context_mode: ContextMode;
  usage: Usage;
  collapsed: boolean;
  starred: boolean;
  /** The whole message has been added to notes — may only happen once. */
  noted: boolean;
  /** How many excerpts have been clipped from it; unlimited by design. */
  clip_count: number;
  /** Assigned once at branch creation; null for plain continuations. */
  color_slot: number | null;
  /** The reply was cancelled mid-stream; the partial text is kept. */
  stopped: boolean;
  x: number | null;
  y: number | null;
}

export interface Template {
  id: string;
  title: string;
  body: string;
  created_at?: number;
}

export type Tab = "chat" | "graph" | "notes";

export interface SearchResult {
  node_id: string;
  tree_id: string;
  tree_title: string;
  role: Role;
  anchor_text: string | null;
  created_at: number;
  /** Match wrapped in \x02…\x03 markers for highlighting. */
  snippet: string;
}

export interface TreeSummary {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  nodes: number;
  branches: number;
  starred: number;
}

export interface TreeData {
  id: string;
  nodes: Record<string, Node>;
  children: Record<string, string[]>;
}

export interface CacheVerdict {
  cacheable: boolean;
  minimum?: number;
  note: string;
}

export interface Estimate {
  prefix_tokens: number;
  prefix_messages: number;
  mode: ContextMode;
  cache: CacheVerdict;
}

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
}

export interface ProviderInfo {
  models: string[];
  supports_caching: boolean;
  supports_search: boolean;
  /** Per-model; local models vary widely in what they can do. */
  capabilities: Record<string, ModelCapabilities>;
  /** Has a usable credential (or, for Ollama, is running). */
  configured?: boolean;
  error: string | null;
}

/** A concrete provider+model choice. */
export interface ModelChoice {
  provider: string;
  model: string;
}

export type SearchMode = "off" | "on";

export type AttachmentPreview =
  | { type: "image"; data_uri: string }
  | { type: "text"; text: string }
  | { type: "none"; note: string }
  | { type: "missing" };

export interface Attachment {
  id: string;
  tree_id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  created_at: number;
  x: number | null;
  y: number | null;
  kind: "image" | "text" | "pdf" | "other";
  preview: AttachmentPreview;
}

export interface AttachmentLink {
  node_id: string;
  attachment_id: string;
}

/** A pending branch, from text selection to sent message. */
export interface DraftBranch {
  anchorText: string;
  anchorNodeId: string;
  parentId: string;
  mode: ContextMode;
}
