"use client";

import type { ENSProfile } from "@/lib/ens";

interface Props {
  profile: ENSProfile;
}

const SOCIAL_ICONS: Record<string, { label: string; urlPrefix: string }> = {
  "com.twitter": { label: "Twitter / X", urlPrefix: "https://x.com/" },
  "com.github": { label: "GitHub", urlPrefix: "https://github.com/" },
  "com.discord": { label: "Discord", urlPrefix: "" },
  "com.linkedin": {
    label: "LinkedIn",
    urlPrefix: "https://linkedin.com/in/",
  },
  "org.telegram": { label: "Telegram", urlPrefix: "https://t.me/" },
  "io.keybase": { label: "Keybase", urlPrefix: "https://keybase.io/" },
};

const CHAIN_LABELS: Record<string, string> = {
  eth: "Ethereum",
  btc: "Bitcoin",
  ltc: "Litecoin",
  doge: "Dogecoin",
};

export function ProfileCard({ profile }: Props) {
  const {
    ensName,
    address,
    ethBalance,
    avatar,
    textRecords,
    contentHash,
    addresses,
  } = profile;

  const displayName = textRecords.display || ensName;
  const description = textRecords.description;
  const url = textRecords.url;
  const email = textRecords.email;
  const location = textRecords.location;
  const keywords = textRecords.keywords;
  const notice = textRecords.notice;
  const phone = textRecords.phone;
  const headerUrl = textRecords.header;

  const socialRecords = Object.entries(textRecords).filter(
    ([key]) => key in SOCIAL_ICONS
  );

  const infoFields = [
    email && { label: "Email", value: email },
    location && { label: "Location", value: location },
    phone && { label: "Phone", value: phone },
    keywords && { label: "Keywords", value: keywords },
    notice && { label: "Notice", value: notice },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="space-y-6">
      {/* Header / Banner */}
      <div className="relative rounded-2xl overflow-hidden">
        {headerUrl ? (
          <img
            src={headerUrl}
            alt="Profile banner"
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 bg-gradient-to-r from-accent-purple/20 via-accent-blue/20 to-accent-green/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-500/90 to-transparent" />

        {/* Avatar + Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-5">
          {avatar ? (
            <img
              src={avatar}
              alt={ensName}
              className="w-20 h-20 rounded-full border-4 border-dark-500 object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-dark-500 bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-2xl font-bold">
              {ensName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-white truncate">
              {displayName}
            </h1>
            {description && (
              <p className="text-gray-300 mt-1 line-clamp-2">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Address + Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard
          label="Ethereum Address"
          value={address || "—"}
          mono
          copyable
        />
        <InfoCard
          label="ETH Balance"
          value={ethBalance ? `${parseFloat(ethBalance).toFixed(4)} ETH` : "—"}
        />
      </div>

      {/* URL */}
      {url && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Website
          </span>
          <a
            href={url.startsWith("http") ? url : `https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-accent-blue hover:underline mt-1 truncate"
          >
            {url}
          </a>
        </div>
      )}

      {/* Social links */}
      {socialRecords.length > 0 && (
        <Section title="Social Profiles">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {socialRecords.map(([key, value]) => {
              const social = SOCIAL_ICONS[key];
              const href = social.urlPrefix ? `${social.urlPrefix}${value}` : undefined;
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center text-xs font-bold text-accent-purple">
                    {social.label.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">{social.label}</div>
                    <div className="text-sm text-white truncate">{value}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {/* Additional info */}
      {infoFields.length > 0 && (
        <Section title="Profile Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {infoFields.map(({ label, value }) => (
              <InfoCard key={label} label={label} value={value} />
            ))}
          </div>
        </Section>
      )}

      {/* Multi-chain addresses */}
      {Object.keys(addresses).length > 0 && (
        <Section title="Multi-Chain Addresses">
          <div className="space-y-3">
            {Object.entries(addresses).map(([chain, addr]) => (
              <InfoCard
                key={chain}
                label={CHAIN_LABELS[chain] || chain.toUpperCase()}
                value={addr}
                mono
                copyable
              />
            ))}
          </div>
        </Section>
      )}

      {/* Content hash */}
      {contentHash && (
        <Section title="Content Hash">
          <InfoCard label="Decentralized Website" value={contentHash} mono />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 group">
      <span className="text-xs text-gray-500 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-center gap-2 mt-1">
        <span
          className={`text-sm text-white truncate flex-1 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
            title="Copy to clipboard"
          >
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
