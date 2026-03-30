import { JsonRpcProvider, formatEther } from "ethers";

const RPC_ENDPOINTS = [
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
  "https://ethereum-rpc.publicnode.com",
  "https://1rpc.io/eth",
];

function createProvider(): JsonRpcProvider {
  return new JsonRpcProvider(RPC_ENDPOINTS[0]);
}

const TEXT_RECORD_KEYS = [
  "avatar",
  "header",
  "description",
  "display",
  "email",
  "url",
  "location",
  "notice",
  "keywords",
  "phone",
  "mail",
  "com.twitter",
  "com.github",
  "com.discord",
  "com.linkedin",
  "org.telegram",
  "io.keybase",
] as const;

const COIN_TYPES: Record<string, { name: string; coinType: number }> = {
  btc: { name: "Bitcoin", coinType: 0 },
  ltc: { name: "Litecoin", coinType: 2 },
  doge: { name: "Dogecoin", coinType: 3 },
  eth: { name: "Ethereum", coinType: 60 },
};

export interface ENSProfile {
  ensName: string;
  address: string | null;
  ethBalance: string | null;
  avatar: string | null;
  textRecords: Record<string, string>;
  contentHash: string | null;
  addresses: Record<string, string>;
}

export async function resolveENS(ensName: string): Promise<ENSProfile> {
  const provider = createProvider();

  const address = await provider.resolveName(ensName);
  if (!address) {
    return {
      ensName,
      address: null,
      ethBalance: null,
      avatar: null,
      textRecords: {},
      contentHash: null,
      addresses: {},
    };
  }

  const resolver = await provider.getResolver(ensName);

  const [ethBalance, textResults, contentHash, multiChainAddresses, avatar] =
    await Promise.all([
      provider.getBalance(address).then(
        (b) => formatEther(b),
        () => null
      ),
      fetchTextRecords(resolver),
      resolver?.getContentHash().catch(() => null) ?? null,
      fetchMultiChainAddresses(resolver),
      resolver?.getAvatar().catch(() => null) ?? null,
    ]);

  return {
    ensName,
    address,
    ethBalance,
    avatar,
    textRecords: textResults,
    contentHash,
    addresses: multiChainAddresses,
  };
}

async function fetchTextRecords(
  resolver: Awaited<ReturnType<JsonRpcProvider["getResolver"]>>
): Promise<Record<string, string>> {
  if (!resolver) return {};

  const results = await Promise.allSettled(
    TEXT_RECORD_KEYS.map(async (key) => {
      const value = await resolver.getText(key);
      return { key, value };
    })
  );

  const records: Record<string, string> = {};
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.value) {
      records[result.value.key] = result.value.value;
    }
  }
  return records;
}

async function fetchMultiChainAddresses(
  resolver: Awaited<ReturnType<JsonRpcProvider["getResolver"]>>
): Promise<Record<string, string>> {
  if (!resolver) return {};

  const results = await Promise.allSettled(
    Object.entries(COIN_TYPES).map(async ([key, { coinType }]) => {
      const addr = await resolver.getAddress(coinType);
      return { key, addr };
    })
  );

  const addresses: Record<string, string> = {};
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.addr) {
      addresses[result.value.key] = result.value.addr;
    }
  }
  return addresses;
}
