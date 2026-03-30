"use client";

export interface FriendshipRecord {
  id: string;
  ens_a: string;
  ens_b: string;
  address_a: string | null;
  address_b: string | null;
  created_at: string;
}

type CreateFriendshipResult =
  | { friendship: FriendshipRecord; reason?: undefined }
  | { friendship: null; reason: "missing" | "self" | "duplicate" };

const STORAGE_KEY = "ens-explorer:friendships:v1";
const CHANGE_EVENT = "ens-explorer:friendships:changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function normalizeEns(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.endsWith(".eth") ? trimmed : `${trimmed}.eth`;
}

function sortPair(ensA: string, ensB: string): [string, string] {
  return ensA < ensB ? [ensA, ensB] : [ensB, ensA];
}

function parseFriendshipRecord(value: unknown): FriendshipRecord | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<FriendshipRecord>;
  if (typeof record.id !== "string") return null;
  if (typeof record.ens_a !== "string") return null;
  if (typeof record.ens_b !== "string") return null;
  if (typeof record.created_at !== "string") return null;

  return {
    id: record.id,
    ens_a: record.ens_a,
    ens_b: record.ens_b,
    address_a: record.address_a ?? null,
    address_b: record.address_b ?? null,
    created_at: record.created_at,
  };
}

function readFriendships(): FriendshipRecord[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseFriendshipRecord)
      .filter((record): record is FriendshipRecord => record !== null)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  } catch {
    return [];
  }
}

function writeFriendships(friendships: FriendshipRecord[]): void {
  if (!isBrowser()) return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(friendships));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function listFriendships(ensFilter?: string): FriendshipRecord[] {
  const friendships = readFriendships();
  if (!ensFilter) return friendships;

  const normalized = normalizeEns(ensFilter);
  return friendships.filter((friendship) => friendship.ens_a === normalized || friendship.ens_b === normalized);
}

export function createFriendship(
  ensA: string,
  ensB: string,
  addressA?: string | null,
  addressB?: string | null
): CreateFriendshipResult {
  const normalizedA = normalizeEns(ensA);
  const normalizedB = normalizeEns(ensB);

  if (!normalizedA || !normalizedB) {
    return { friendship: null, reason: "missing" };
  }

  if (normalizedA === normalizedB) {
    return { friendship: null, reason: "self" };
  }

  const [low, high] = sortPair(normalizedA, normalizedB);
  const friendships = readFriendships();
  const exists = friendships.some((friendship) => friendship.ens_a === low && friendship.ens_b === high);

  if (exists) {
    return { friendship: null, reason: "duplicate" };
  }

  const friendship: FriendshipRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ens_a: low,
    ens_b: high,
    address_a: low === normalizedA ? addressA ?? null : addressB ?? null,
    address_b: high === normalizedB ? addressB ?? null : addressA ?? null,
    created_at: new Date().toISOString(),
  };

  writeFriendships([friendship, ...friendships]);
  return { friendship };
}

export function removeFriendship(ensA: string, ensB: string): boolean {
  const normalizedA = normalizeEns(ensA);
  const normalizedB = normalizeEns(ensB);
  if (!normalizedA || !normalizedB) return false;

  const [low, high] = sortPair(normalizedA, normalizedB);
  const friendships = readFriendships();
  const nextFriendships = friendships.filter(
    (friendship) => !(friendship.ens_a === low && friendship.ens_b === high)
  );

  if (nextFriendships.length === friendships.length) {
    return false;
  }

  writeFriendships(nextFriendships);
  return true;
}

export function subscribeToFriendships(onChange: () => void): () => void {
  if (!isBrowser()) return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
