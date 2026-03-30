const ETHERSCAN_BASE = "https://api.etherscan.io/api";

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  txreceipt_status?: string;
  isError?: string;
  tokenName?: string;
  tokenSymbol?: string;
  contractAddress?: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

export interface RelationshipSummary {
  // Direct transactions between the pair
  directTxCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  aToB: number;
  bToA: number;
  // Shared on-chain activity
  sharedTokens: string[];       // token symbols both addresses have used
  sharedContracts: number;      // number of contracts both interacted with
  // Relationship strength (0-100)
  strength: number;
  // Human-readable label
  label: string;
}

function getApiKey(): string {
  return process.env.ETHERSCAN_API_KEY ?? "";
}

async function etherscanFetch(
  action: string,
  address: string,
  offset = 5000
): Promise<EtherscanTx[]> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    module: "account",
    action,
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: String(offset),
    sort: "desc",
  });
  if (apiKey) params.set("apikey", apiKey);

  const res = await fetch(`${ETHERSCAN_BASE}?${params}`, {
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];

  const data: EtherscanResponse = await res.json();

  if (!Array.isArray(data.result)) return [];
  return data.result;
}

// Extract unique contract addresses and token symbols from token transfers
function extractTokenProfile(tokenTxs: EtherscanTx[]): {
  tokens: Map<string, string>; // contractAddress -> symbol
  contracts: Set<string>;       // all contracts interacted with
} {
  const tokens = new Map<string, string>();
  const contracts = new Set<string>();

  for (const tx of tokenTxs) {
    if (tx.contractAddress && tx.tokenSymbol) {
      tokens.set(tx.contractAddress.toLowerCase(), tx.tokenSymbol);
    }
    if (tx.to) contracts.add(tx.to.toLowerCase());
    if (tx.from) contracts.add(tx.from.toLowerCase());
  }

  return { tokens, contracts };
}

// Extract contracts interacted with from normal txs
function extractContractInteractions(txs: EtherscanTx[]): Set<string> {
  const contracts = new Set<string>();
  for (const tx of txs) {
    // If tx has input data > "0x", it's a contract interaction
    if (tx.to) contracts.add(tx.to.toLowerCase());
  }
  return contracts;
}

function filterForCounterparty(txs: EtherscanTx[], counterparty: string): EtherscanTx[] {
  const cp = counterparty.toLowerCase();
  return txs.filter((tx) => {
    const isSuccess = tx.txreceipt_status === "1" || tx.isError === "0" ||
      (!tx.txreceipt_status && !tx.isError);
    return isSuccess && (tx.from.toLowerCase() === cp || tx.to.toLowerCase() === cp);
  });
}

function weiToEth(totalWei: bigint): string {
  const ethWhole = totalWei / BigInt(10 ** 18);
  const ethFraction = totalWei % BigInt(10 ** 18);
  const fractionStr = ethFraction.toString().padStart(18, "0").slice(0, 4);
  return `${ethWhole}.${fractionStr}`;
}

export async function getRelationship(
  addressA: string,
  addressB: string
): Promise<RelationshipSummary> {
  const a = addressA.toLowerCase();
  const b = addressB.toLowerCase();

  // Fetch activity for both addresses in parallel
  const [normalA, tokenA, normalB, tokenB] = await Promise.all([
    etherscanFetch("txlist", a, 2000),
    etherscanFetch("tokentx", a, 2000),
    etherscanFetch("txlist", b, 2000),
    etherscanFetch("tokentx", b, 2000),
  ]);

  // 1. Direct transactions between A and B
  const directFromA = filterForCounterparty(normalA, b);
  const directFromB = filterForCounterparty(normalB, a);
  const directTokenFromA = filterForCounterparty(tokenA, b);
  const directTokenFromB = filterForCounterparty(tokenB, a);

  // Deduplicate direct txs
  const seenHashes = new Set<string>();
  const allDirect = [...directFromA, ...directFromB, ...directTokenFromA, ...directTokenFromB]
    .filter((tx) => {
      if (seenHashes.has(tx.hash)) return false;
      seenHashes.add(tx.hash);
      return true;
    });

  let totalWei = BigInt(0);
  let latestTs = 0;
  let aToB = 0;
  let bToA = 0;

  for (const tx of allDirect) {
    totalWei += BigInt(tx.value);
    const ts = parseInt(tx.timeStamp, 10);
    if (ts > latestTs) latestTs = ts;
    if (tx.from.toLowerCase() === a) aToB++;
    else bToA++;
  }

  // 2. Shared tokens (both addresses have interacted with the same token contracts)
  const profileA = extractTokenProfile(tokenA);
  const profileB = extractTokenProfile(tokenB);

  const sharedTokens: string[] = [];
  for (const [contract, symbol] of profileA.tokens) {
    if (profileB.tokens.has(contract)) {
      sharedTokens.push(symbol);
    }
  }
  // Deduplicate and limit
  const uniqueSharedTokens = [...new Set(sharedTokens)].slice(0, 10);

  // 3. Shared contracts (both interacted with same contracts via normal txs)
  const contractsA = extractContractInteractions(normalA);
  const contractsB = extractContractInteractions(normalB);
  let sharedContractCount = 0;
  for (const c of contractsA) {
    if (contractsB.has(c) && c !== a && c !== b) {
      sharedContractCount++;
    }
  }

  // 4. Calculate relationship strength (0-100)
  let strength = 0;
  if (allDirect.length > 0) strength += Math.min(50, allDirect.length * 10);
  if (uniqueSharedTokens.length > 0) strength += Math.min(30, uniqueSharedTokens.length * 5);
  if (sharedContractCount > 0) strength += Math.min(20, sharedContractCount * 2);
  strength = Math.min(100, strength);

  // 5. Build human-readable label
  let label = "";
  if (allDirect.length > 0) {
    const ethVal = parseFloat(weiToEth(totalWei));
    label = `${allDirect.length} tx`;
    if (ethVal > 0.001) label += ` · ${ethVal.toFixed(2)} ETH`;
  }
  if (uniqueSharedTokens.length > 0) {
    const tokenLabel = uniqueSharedTokens.slice(0, 3).join(", ");
    const extra = uniqueSharedTokens.length > 3 ? ` +${uniqueSharedTokens.length - 3}` : "";
    label += label ? ` · ${tokenLabel}${extra}` : `${tokenLabel}${extra}`;
  }
  if (!label && sharedContractCount > 0) {
    label = `${sharedContractCount} shared contracts`;
  }
  if (!label) {
    label = "no on-chain link";
  }

  return {
    directTxCount: allDirect.length,
    totalValueEth: weiToEth(totalWei),
    lastTxTimestamp: latestTs || null,
    aToB,
    bToA,
    sharedTokens: uniqueSharedTokens,
    sharedContracts: sharedContractCount,
    strength,
    label,
  };
}
