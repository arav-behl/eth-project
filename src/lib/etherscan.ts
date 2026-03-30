const BLOCKSCOUT_BASE = "https://eth.blockscout.com/api/v2";
const PAGE_SIZE = 50;
const MAX_PAGES = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;
const WEI_PER_ETH = BigInt("1000000000000000000");

interface BlockscoutAddressRef {
  hash?: string | null;
  is_contract?: boolean | null;
  name?: string | null;
  ens_domain_name?: string | null;
}

interface BlockscoutTransaction {
  hash: string;
  from?: BlockscoutAddressRef | null;
  to?: BlockscoutAddressRef | null;
  status?: string | null;
  value?: string | null;
  timestamp?: string | null;
}

interface BlockscoutToken {
  address_hash?: string | null;
  symbol?: string | null;
  name?: string | null;
}

interface BlockscoutTransferTotal {
  value?: string | null;
  decimals?: string | null;
}

interface BlockscoutTokenTransfer {
  transaction_hash: string;
  from?: BlockscoutAddressRef | null;
  to?: BlockscoutAddressRef | null;
  token?: BlockscoutToken | null;
  total?: BlockscoutTransferTotal | null;
  timestamp?: string | null;
}

interface BlockscoutPage<T> {
  items?: T[];
  next_page_params?: Record<string, string | number | boolean | null>;
}

interface AddressActivity {
  nativeTxs: BlockscoutTransaction[];
  tokenTransfers: BlockscoutTokenTransfer[];
  counterparties: Set<string>;
  contracts: Set<string>;
  tokens: Map<string, string>;
  contractLabels: Map<string, string>;
}

interface CachedActivity {
  fetchedAt: number;
  promise?: Promise<AddressActivity>;
  value?: AddressActivity;
}

export interface RelationshipSummary {
  directTxCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  aToB: number;
  bToA: number;
  sharedTokens: string[];
  sharedContracts: number;
  sharedContractDetails: Array<{
    address: string;
    label: string;
  }>;
  recentInteractions: Array<{
    hash: string;
    timestamp: number | null;
    kind: "native" | "token";
    from: string | null;
    to: string | null;
    value: string;
    asset: string;
  }>;
  strength: number;
  label: string;
}

const activityCache = new Map<string, CachedActivity>();

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function getAddressHash(ref?: BlockscoutAddressRef | null): string | null {
  if (!ref?.hash) return null;
  return ref.hash.toLowerCase();
}

function isTransactionSuccess(tx: BlockscoutTransaction): boolean {
  return tx.status !== "error";
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getAddressLabel(ref?: BlockscoutAddressRef | null): string | null {
  if (!ref) return null;
  const label = ref.ens_domain_name || ref.name;
  if (label) return label;
  if (ref.hash) return shortenAddress(ref.hash);
  return null;
}

function formatTokenValue(total?: BlockscoutTransferTotal | null): string {
  if (!total?.value) return "0";
  const decimals = Number(total.decimals ?? "0");
  const raw = total.value;
  if (!Number.isFinite(decimals) || decimals <= 0) {
    return raw;
  }

  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "").slice(0, 4);
  return fraction ? `${whole}.${fraction}` : whole;
}

function weiToEth(totalWei: bigint): string {
  const whole = totalWei / WEI_PER_ETH;
  const fraction = totalWei % WEI_PER_ETH;
  const fractionStr = fraction.toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fractionStr}`;
}

function countDirection(
  ownAddress: string,
  counterparty: string,
  fromAddress: string | null,
  toAddress: string | null
): { fromOwn: boolean; fromCounterparty: boolean } {
  return {
    fromOwn: fromAddress === ownAddress && toAddress === counterparty,
    fromCounterparty: fromAddress === counterparty && toAddress === ownAddress,
  };
}

async function fetchPage<T>(
  path: string,
  nextPageParams?: Record<string, string | number | boolean | null>
): Promise<BlockscoutPage<T>> {
  const url = new URL(`${BLOCKSCOUT_BASE}${path}`);
  url.searchParams.set("items_count", String(PAGE_SIZE));

  if (nextPageParams) {
    for (const [key, value] of Object.entries(nextPageParams)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`Blockscout HTTP ${res.status}`);
  }

  const data = (await res.json()) as BlockscoutPage<T>;
  return data;
}

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let nextPageParams: Record<string, string | number | boolean | null> | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchPage<T>(path, nextPageParams);
    if (Array.isArray(data.items)) {
      items.push(...data.items);
    }
    if (!data.next_page_params) {
      break;
    }
    nextPageParams = data.next_page_params;
  }

  return items;
}

function buildActivity(
  address: string,
  nativeTxs: BlockscoutTransaction[],
  tokenTransfers: BlockscoutTokenTransfer[]
): AddressActivity {
  const self = normalizeAddress(address);
  const counterparties = new Set<string>();
  const contracts = new Set<string>();
  const tokens = new Map<string, string>();
  const contractLabels = new Map<string, string>();

  for (const tx of nativeTxs) {
    if (!isTransactionSuccess(tx)) continue;

    const fromAddress = getAddressHash(tx.from);
    const toAddress = getAddressHash(tx.to);

    if (fromAddress && fromAddress !== self) counterparties.add(fromAddress);
    if (toAddress && toAddress !== self) counterparties.add(toAddress);

    if (tx.from?.is_contract && fromAddress && fromAddress !== self) {
      contracts.add(fromAddress);
      contractLabels.set(fromAddress, getAddressLabel(tx.from) || shortenAddress(fromAddress));
    }
    if (tx.to?.is_contract && toAddress && toAddress !== self) {
      contracts.add(toAddress);
      contractLabels.set(toAddress, getAddressLabel(tx.to) || shortenAddress(toAddress));
    }
  }

  for (const transfer of tokenTransfers) {
    const fromAddress = getAddressHash(transfer.from);
    const toAddress = getAddressHash(transfer.to);

    if (fromAddress && fromAddress !== self) counterparties.add(fromAddress);
    if (toAddress && toAddress !== self) counterparties.add(toAddress);

    if (transfer.from?.is_contract && fromAddress && fromAddress !== self) {
      contracts.add(fromAddress);
      contractLabels.set(fromAddress, getAddressLabel(transfer.from) || shortenAddress(fromAddress));
    }
    if (transfer.to?.is_contract && toAddress && toAddress !== self) {
      contracts.add(toAddress);
      contractLabels.set(toAddress, getAddressLabel(transfer.to) || shortenAddress(toAddress));
    }

    if (transfer.token?.address_hash) {
      const tokenContract = transfer.token.address_hash.toLowerCase();
      tokens.set(
        tokenContract,
        transfer.token.symbol?.trim() || "token"
      );
      contracts.add(tokenContract);
      contractLabels.set(
        tokenContract,
        transfer.token.symbol?.trim() || transfer.token.name?.trim() || shortenAddress(tokenContract)
      );
    }
  }

  return { nativeTxs, tokenTransfers, counterparties, contracts, tokens, contractLabels };
}

async function loadAddressActivity(address: string): Promise<AddressActivity> {
  const [nativeTxs, tokenTransfers] = await Promise.all([
    fetchAllPages<BlockscoutTransaction>(`/addresses/${address}/transactions`),
    fetchAllPages<BlockscoutTokenTransfer>(`/addresses/${address}/token-transfers`),
  ]);

  return buildActivity(address, nativeTxs, tokenTransfers);
}

async function getAddressActivity(address: string): Promise<AddressActivity> {
  const normalized = normalizeAddress(address);
  const cached = activityCache.get(normalized);
  const now = Date.now();

  if (cached?.value && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = loadAddressActivity(normalized)
    .then((value) => {
      activityCache.set(normalized, { fetchedAt: Date.now(), value });
      return value;
    })
    .catch((error) => {
      activityCache.delete(normalized);
      throw error;
    });

  activityCache.set(normalized, { fetchedAt: now, promise });
  return promise;
}

export async function getRelationship(
  addressA: string,
  addressB: string
): Promise<RelationshipSummary> {
  const a = normalizeAddress(addressA);
  const b = normalizeAddress(addressB);

  const [activityA, activityB] = await Promise.all([
    getAddressActivity(a),
    getAddressActivity(b),
  ]);

  const directNative = activityA.nativeTxs.filter((tx) => {
    if (!isTransactionSuccess(tx)) return false;
    const fromAddress = getAddressHash(tx.from);
    const toAddress = getAddressHash(tx.to);
    return fromAddress === b || toAddress === b;
  });

  const directTokenTransfers = activityA.tokenTransfers.filter((transfer) => {
    const fromAddress = getAddressHash(transfer.from);
    const toAddress = getAddressHash(transfer.to);
    return fromAddress === b || toAddress === b;
  });

  const directInteractionIds = new Set<string>();
  let directTxCount = 0;
  let totalWei = BigInt(0);
  let latestTimestamp: number | null = null;
  let aToB = 0;
  let bToA = 0;

  for (const tx of directNative) {
    if (directInteractionIds.has(tx.hash)) continue;
    directInteractionIds.add(tx.hash);
    directTxCount += 1;
    totalWei += BigInt(tx.value || "0");

    const fromAddress = getAddressHash(tx.from);
    const toAddress = getAddressHash(tx.to);
    const direction = countDirection(a, b, fromAddress, toAddress);
    if (direction.fromOwn) aToB += 1;
    if (direction.fromCounterparty) bToA += 1;

    const ts = parseTimestamp(tx.timestamp);
    if (ts && (!latestTimestamp || ts > latestTimestamp)) {
      latestTimestamp = ts;
    }
  }

  for (const transfer of directTokenTransfers) {
    const transferId = `${transfer.transaction_hash}:${getAddressHash(transfer.from) ?? "x"}:${getAddressHash(transfer.to) ?? "y"}:${transfer.token?.address_hash ?? "token"}`;
    if (directInteractionIds.has(transferId)) continue;
    directInteractionIds.add(transferId);
    directTxCount += 1;

    const fromAddress = getAddressHash(transfer.from);
    const toAddress = getAddressHash(transfer.to);
    const direction = countDirection(a, b, fromAddress, toAddress);
    if (direction.fromOwn) aToB += 1;
    if (direction.fromCounterparty) bToA += 1;

    const ts = parseTimestamp(transfer.timestamp);
    if (ts && (!latestTimestamp || ts > latestTimestamp)) {
      latestTimestamp = ts;
    }
  }

  const sharedTokens = [...activityA.tokens.entries()]
    .filter(([contract]) => activityB.tokens.has(contract))
    .map(([, symbol]) => symbol)
    .filter(Boolean);
  const uniqueSharedTokens = [...new Set(sharedTokens)].slice(0, 10);

  const sharedContracts = [...activityA.contracts].filter(
    (contract) => contract !== a && contract !== b && activityB.contracts.has(contract)
  );
  const sharedContractDetails = sharedContracts
    .map((address) => ({
      address,
      label:
        activityA.contractLabels.get(address) ||
        activityB.contractLabels.get(address) ||
        shortenAddress(address),
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, 20);

  const sharedCounterparties = [...activityA.counterparties].filter(
    (counterparty) => counterparty !== a && counterparty !== b && activityB.counterparties.has(counterparty)
  );

  const recentInteractions = [
    ...directNative.map((tx) => ({
      hash: tx.hash,
      timestamp: parseTimestamp(tx.timestamp),
      kind: "native" as const,
      from: getAddressHash(tx.from),
      to: getAddressHash(tx.to),
      value: weiToEth(BigInt(tx.value || "0")),
      asset: "ETH",
    })),
    ...directTokenTransfers.map((transfer) => ({
      hash: transfer.transaction_hash,
      timestamp: parseTimestamp(transfer.timestamp),
      kind: "token" as const,
      from: getAddressHash(transfer.from),
      to: getAddressHash(transfer.to),
      value: formatTokenValue(transfer.total),
      asset: transfer.token?.symbol?.trim() || "token",
    })),
  ]
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 12);

  let strength = 0;
  if (directTxCount > 0) strength += Math.min(70, directTxCount * 16);
  if (sharedCounterparties.length > 0) strength += Math.min(18, sharedCounterparties.length * 3);
  if (uniqueSharedTokens.length > 0) strength += Math.min(12, uniqueSharedTokens.length * 4);
  if (sharedContracts.length > 0) strength += Math.min(12, sharedContracts.length * 2);
  strength = Math.min(100, strength);

  const labelParts: string[] = [];
  if (directNative.length > 0 || directTokenTransfers.length > 0) {
    const directParts: string[] = [];
    if (directNative.length > 0) {
      directParts.push(`${directNative.length} direct tx`);
    }
    if (directTokenTransfers.length > 0) {
      directParts.push(`${directTokenTransfers.length} token transfer${directTokenTransfers.length === 1 ? "" : "s"}`);
    }
    labelParts.push(directParts.join(" + "));
  }
  if (sharedCounterparties.length > 0) {
    labelParts.push(`${sharedCounterparties.length} shared counterpart${sharedCounterparties.length === 1 ? "y" : "ies"}`);
  }
  if (uniqueSharedTokens.length > 0) {
    const tokenLabel = uniqueSharedTokens.slice(0, 3).join(", ");
    const extra = uniqueSharedTokens.length > 3 ? ` +${uniqueSharedTokens.length - 3}` : "";
    labelParts.push(`${tokenLabel}${extra}`);
  } else if (sharedContracts.length > 0) {
    labelParts.push(`${sharedContracts.length} shared contract${sharedContracts.length === 1 ? "" : "s"}`);
  }

  return {
    directTxCount,
    totalValueEth: weiToEth(totalWei),
    lastTxTimestamp: latestTimestamp,
    aToB,
    bToA,
    sharedTokens: uniqueSharedTokens,
    sharedContracts: sharedContracts.length,
    sharedContractDetails,
    recentInteractions,
    strength,
    label: labelParts.join(" · ") || "no on-chain link",
  };
}
