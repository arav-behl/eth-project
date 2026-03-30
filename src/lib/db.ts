import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;

  const candidatePaths = [
    path.join(process.cwd(), "data", "ens-explorer.db"),
    path.join(os.tmpdir(), "ens-explorer.db"),
  ];

  let lastError: unknown = null;

  for (const dbPath of candidatePaths) {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      _db = new Database(dbPath);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!_db) {
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("Failed to open SQLite database");
  }

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS graphs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      ens_name TEXT NOT NULL,
      address TEXT,
      avatar TEXT,
      display_name TEXT,
      description TEXT,
      eth_balance TEXT,
      UNIQUE(graph_id, ens_name)
    );

    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      source_ens TEXT NOT NULL,
      target_ens TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(graph_id, source_ens, target_ens)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ens_a TEXT NOT NULL,
      ens_b TEXT NOT NULL,
      address_a TEXT,
      address_b TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ens_a, ens_b)
    );
  `);

  return _db;
}

export interface GraphNodeData {
  ensName: string;
  address: string | null;
  avatar: string | null;
  displayName: string | null;
  description: string | null;
  ethBalance: string | null;
}

export interface GraphEdgeData {
  sourceEns: string;
  targetEns: string;
  label: string | null;
}

export interface GraphData {
  id: string;
  name: string;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  createdAt: string;
  updatedAt: string;
}

interface GraphRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface NodeRow {
  ens_name: string;
  address: string | null;
  avatar: string | null;
  display_name: string | null;
  description: string | null;
  eth_balance: string | null;
}

interface EdgeRow {
  source_ens: string;
  target_ens: string;
  label: string | null;
}

interface GraphListRow {
  id: string;
  name: string;
  created_at: string;
  node_count: number;
}

export function createGraph(id: string, name: string = "Untitled"): void {
  db().prepare("INSERT INTO graphs (id, name) VALUES (?, ?)").run(id, name);
}

export function getGraph(graphId: string): GraphData | null {
  const d = db();

  const row = d.prepare("SELECT * FROM graphs WHERE id = ?").get(graphId) as GraphRow | undefined;
  if (!row) return null;

  const nodeRows = d.prepare("SELECT * FROM nodes WHERE graph_id = ?").all(graphId) as NodeRow[];
  const edgeRows = d.prepare("SELECT * FROM edges WHERE graph_id = ?").all(graphId) as EdgeRow[];

  return {
    id: row.id,
    name: row.name,
    nodes: nodeRows.map((n) => ({
      ensName: n.ens_name,
      address: n.address,
      avatar: n.avatar,
      displayName: n.display_name,
      description: n.description,
      ethBalance: n.eth_balance,
    })),
    edges: edgeRows.map((e) => ({
      sourceEns: e.source_ens,
      targetEns: e.target_ens,
      label: e.label,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function addNode(graphId: string, node: GraphNodeData): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO nodes (graph_id, ens_name, address, avatar, display_name, description, eth_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(graphId, node.ensName, node.address, node.avatar, node.displayName, node.description, node.ethBalance);
}

export function removeNode(graphId: string, ensName: string): void {
  const d = db();
  d.prepare("DELETE FROM edges WHERE graph_id = ? AND (source_ens = ? OR target_ens = ?)").run(
    graphId,
    ensName,
    ensName
  );
  d.prepare("DELETE FROM nodes WHERE graph_id = ? AND ens_name = ?").run(graphId, ensName);
}

export function addEdge(graphId: string, edge: GraphEdgeData): void {
  db()
    .prepare(
      `INSERT OR IGNORE INTO edges (graph_id, source_ens, target_ens, label)
       VALUES (?, ?, ?, ?)`
    )
    .run(graphId, edge.sourceEns, edge.targetEns, edge.label);
}

export function removeEdge(graphId: string, sourceEns: string, targetEns: string): void {
  db()
    .prepare("DELETE FROM edges WHERE graph_id = ? AND source_ens = ? AND target_ens = ?")
    .run(graphId, sourceEns, targetEns);
}

export function listGraphs(): Array<{ id: string; name: string; nodeCount: number; createdAt: string }> {
  const rows = db()
    .prepare(
      `SELECT g.id, g.name, g.created_at, COUNT(n.id) as node_count
       FROM graphs g
       LEFT JOIN nodes n ON n.graph_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    )
    .all() as GraphListRow[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nodeCount: r.node_count,
    createdAt: r.created_at,
  }));
}

export function deleteGraph(graphId: string): void {
  db().prepare("DELETE FROM graphs WHERE id = ?").run(graphId);
}

/* ── Friendships ────────────────────────────────────────────── */


export interface Friendship {
  id: number;
  ens_a: string;
  ens_b: string;
  address_a: string | null;
  address_b: string | null;
  created_at: string;
}

export function getFriendships(ensFilter?: string): Friendship[] {
  const d = db();
  if (ensFilter) {
    return d
      .prepare("SELECT * FROM friendships WHERE ens_a = ? OR ens_b = ? ORDER BY created_at DESC")
      .all(ensFilter, ensFilter) as Friendship[];
  }
  return d.prepare("SELECT * FROM friendships ORDER BY created_at DESC").all() as Friendship[];
}

export function addFriendship(
  ens_a: string,
  ens_b: string,
  address_a?: string,
  address_b?: string
): Friendship | null {
  const d = db();
  const normalized_a = ens_a.toLowerCase();
  const normalized_b = ens_b.toLowerCase();

  if (normalized_a === normalized_b) return null;

  const [low, high] = normalized_a < normalized_b ? [normalized_a, normalized_b] : [normalized_b, normalized_a];

  try {
    const result = d
      .prepare(
        "INSERT INTO friendships (ens_a, ens_b, address_a, address_b) VALUES (?, ?, ?, ?)"
      )
      .run(low, high, address_a || null, address_b || null);

    return d.prepare("SELECT * FROM friendships WHERE id = ?").get(result.lastInsertRowid) as Friendship;
  } catch {
    return null;
  }
}

export function deleteFriendship(ens_a: string, ens_b: string): boolean {
  const d = db();
  const normalized_a = ens_a.toLowerCase();
  const normalized_b = ens_b.toLowerCase();

  const result = d
    .prepare("DELETE FROM friendships WHERE (ens_a = ? AND ens_b = ?) OR (ens_a = ? AND ens_b = ?)")
    .run(normalized_a, normalized_b, normalized_b, normalized_a);

  return result.changes > 0;
}
