const ETHERSCAN_BASE = "https://api.etherscan.io/api";

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string; // wei
  timeStamp: string;
  txreceipt_status?: string;
  isError?: string;
  tokenName?: string;
  tokenSymbol?: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

export interface TransactionSummary {
  txCount: number;
  totalValueEth: string;
  lastTxTimestamp: number | null;
  aToB: number;
  bToA: number;
  types: string[]; // e.g. ["eth", "erc20", "internal"]
}

function getApiKey(): string {
  return process.env.ETHERSCAN_API_KEY ?? "";
}

async function etherscanFetch(
  action: string,
  address: string,
  offset = 10000
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
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);

  const data: EtherscanResponse = await res.json();

  if (data.status === "0" && typeof data.result === "string" &&
      data.result.toLowerCase().includes("no transactions")) {
    return [];
  }
  if (data.status === "0" && data.message === "NOTOK") {
    throw new Error(`Etherscan error: ${data.result}`);
  }
  if (!Array.isArray(data.result)) return [];

  return data.result;
}

function filterForCounterparty(txs: EtherscanTx[], counterparty: string): EtherscanTx[] {
  const cp = counterparty.toLowerCase();
  return txs.filter((tx) => {
    const isSuccess = tx.txreceipt_status === "1" || tx.isError === "0" || (!tx.txreceipt_status && !tx.isError);
    return isSuccess && (tx.from.toLowerCase() === cp || tx.to.toLowerCase() === cp);
  });
}

export async function getTransactionsBetween(
  addressA: string,
  addressB: string
): Promise<TransactionSummary> {
  const a = addressA.toLowerCase();
  const b = addressB.toLowerCase();

  const empty: TransactionSummary = {
    txCount: 0, totalValueEth: "0", lastTxTimestamp: null, aToB: 0, bToA: 0, types: [],
  };

  // Check normal ETH transactions first
  const normalTxs = await etherscanFetch("txlist", a);
  const ethRelevant = filterForCounterparty(normalTxs, b);

  // Check internal transactions (contract-mediated transfers)
  let internalRelevant: EtherscanTx[] = [];
  try {
    const internalTxs = await etherscanFetch("txlistinternal", a);
    internalRelevant = filterForCounterparty(internalTxs, b);
  } catch {
    // Internal tx API can fail for some addresses
  }

  // Check ERC-20 token transfers
  let erc20Relevant: EtherscanTx[] = [];
  try {
    const erc20Txs = await etherscanFetch("tokentx", a);
    erc20Relevant = filterForCounterparty(erc20Txs, b);
  } catch {
    // Token tx API can fail
  }

  // If nothing from A's side, try from B's side
  if (ethRelevant.length === 0 && internalRelevant.length === 0 && erc20Relevant.length === 0) {
    const normalTxsB = await etherscanFetch("txlist", b);
    const ethFromB = filterForCounterparty(normalTxsB, a);

    let internalFromB: EtherscanTx[] = [];
    try {
      const internalTxsB = await etherscanFetch("txlistinternal", b);
      internalFromB = filterForCounterparty(internalTxsB, a);
    } catch {}

    let erc20FromB: EtherscanTx[] = [];
    try {
      const erc20TxsB = await etherscanFetch("tokentx", b);
      erc20FromB = filterForCounterparty(erc20TxsB, a);
    } catch {}

    if (ethFromB.length === 0 && internalFromB.length === 0 && erc20FromB.length === 0) {
      return empty;
    }

    return buildSummary(ethFromB, internalFromB, erc20FromB, a, b);
  }

  return buildSummary(ethRelevant, internalRelevant, erc20Relevant, a, b);
}

function buildSummary(
  ethTxs: EtherscanTx[],
  internalTxs: EtherscanTx[],
  erc20Txs: EtherscanTx[],
  a: string,
  b: string
): TransactionSummary {
  const types: string[] = [];
  if (ethTxs.length > 0) types.push("eth");
  if (internalTxs.length > 0) types.push("internal");
  if (erc20Txs.length > 0) types.push("erc20");

  const allTxs = [...ethTxs, ...internalTxs];
  // Deduplicate by hash
  const seen = new Set<string>();
  const uniqueTxs = allTxs.filter((tx) => {
    if (seen.has(tx.hash)) return false;
    seen.add(tx.hash);
    return true;
  });

  let totalWei = BigInt(0);
  let latestTs = 0;
  let aToB = 0;
  let bToA = 0;

  for (const tx of uniqueTxs) {
    totalWei += BigInt(tx.value);
    const ts = parseInt(tx.timeStamp, 10);
    if (ts > latestTs) latestTs = ts;
    if (tx.from.toLowerCase() === a) aToB++;
    else bToA++;
  }

  // Also count ERC-20 transfers (they have value=0 in ETH but represent token interactions)
  for (const tx of erc20Txs) {
    const ts = parseInt(tx.timeStamp, 10);
    if (ts > latestTs) latestTs = ts;
    if (tx.from.toLowerCase() === a) aToB++;
    else bToA++;
  }

  const totalTxCount = uniqueTxs.length + erc20Txs.length;

  // Convert wei to ETH
  const ethWhole = totalWei / BigInt(10 ** 18);
  const ethFraction = totalWei % BigInt(10 ** 18);
  const fractionStr = ethFraction.toString().padStart(18, "0").slice(0, 4);
  const totalValueEth = `${ethWhole}.${fractionStr}`;

  return {
    txCount: totalTxCount,
    totalValueEth,
    lastTxTimestamp: latestTs || null,
    aToB,
    bToA,
    types,
  };
}
