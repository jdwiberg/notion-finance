"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  ArrowDownLeft,
  ArrowDownRight,
  Building2,
  Check,
  CircleAlert,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";

type Account = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance: number | null;
  currency: string;
};

type Transaction = {
  id: string;
  name: string;
  merchant: string | null;
  date: string;
  amount: number;
  currency: string;
  category: string;
  accountName: string;
  accountType: string;
};

type Connection = { institutionName: string; accounts: Account[]; transactions: Transaction[] };
type Snapshot = { connections: Connection[] };

async function getSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/plaid/data", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not load your bank data.");
  return result;
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function signedBalance(balance: number | null, accountType: string) {
  if (balance === null) return null;
  return accountType === "credit" ? -Math.abs(balance) : balance;
}

function signedTransactionAmount(amount: number) {
  return -amount;
}

export default function Dashboard() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const shouldOpenLink = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({ connections: [] });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connections = snapshot.connections;
  const accounts = connections.flatMap((connection) =>
    connection.accounts.map((account) => ({ ...account, institutionName: connection.institutionName })),
  );
  const transactions = connections.flatMap((connection) => connection.transactions)
    .sort((left, right) => right.date.localeCompare(left.date));
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (signedBalance(account.balance, account.type) ?? 0),
    0,
  );

  async function loadData(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      setSnapshot(await getSnapshot());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your bank data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        const initialSnapshot = await getSnapshot();
        if (mounted) setSnapshot(initialSnapshot);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Could not load your bank data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void initialize();
    return () => { mounted = false; };
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      setConnecting(true);
      setError(null);
      try {
        const response = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institution: metadata.institution
              ? { id: metadata.institution.institution_id, name: metadata.institution.name }
              : null,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not finish connecting this bank.");
        setLinkToken(null);
        await loadData(false);
      } catch (connectError) {
        setError(connectError instanceof Error ? connectError.message : "Could not finish connecting this bank.");
      } finally {
        setConnecting(false);
      }
    },
    onExit: (linkError) => {
      setConnecting(false);
      if (linkError) setError(linkError.display_message ?? "Bank connection was not completed.");
    },
  });

  useEffect(() => {
    if (linkToken && ready && shouldOpenLink.current) {
      shouldOpenLink.current = false;
      open();
    }
  }, [linkToken, ready, open]);

  async function connectBank() {
    setError(null);
    setConnecting(true);
    try {
      const response = await fetch("/api/plaid/link-token", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start a bank connection.");
      shouldOpenLink.current = true;
      setLinkToken(result.linkToken);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not start a bank connection.");
      setConnecting(false);
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Ledger home">
          <span className="brand-mark"><Landmark size={18} strokeWidth={2.2} /></span>
          <span>ledger<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right"><span className="environment"><span /> Sandbox</span><span className="profile-mark">J</span></div>
      </header>

      <section className="content" id="overview">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PERSONAL FINANCE</p>
            <h1>Your money, in one place.</h1>
            <p className="subheading">A private view of your connected accounts and recent activity.</p>
          </div>
          <button className="button button-primary" onClick={connectBank} disabled={connecting}>
            {connecting ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
            {connecting ? "Connecting" : "Connect a bank"}
          </button>
        </div>

        {error && <div className="notice" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}

        <section className="summary-grid" aria-label="Account overview">
          <div className="summary-main">
            <div className="summary-label"><Wallet size={16} /> TOTAL ACCOUNT BALANCE</div>
            <div className="summary-value">{loading ? "Loading…" : formatMoney(totalBalance, "USD")}</div>
            <div className="summary-foot">Across {accounts.length} {accounts.length === 1 ? "account" : "accounts"}</div>
            <div className="summary-rule" />
            <div className="summary-meta">
              <span>{connections.length} {connections.length === 1 ? "institution" : "institutions"} connected</span>
              <span className="live-indicator"><span /> Live data</span>
            </div>
          </div>
          <div className="summary-side">
            <div className="side-label">CONNECTED INSTITUTIONS</div>
            {loading ? <div className="empty-inline"><LoaderCircle className="spin" size={16} /> Loading connections</div> : connections.length ? (
              <div className="institution-list">
                {connections.map((connection, index) => <div className="institution-row" key={`${connection.institutionName}-${index}`}>
                  <span className="institution-icon"><Building2 size={17} /></span>
                  <span className="institution-name">{connection.institutionName}</span>
                  <Check className="connected-check" size={16} />
                </div>)}
              </div>
            ) : <div className="empty-inline">No banks connected yet</div>}
          </div>
        </section>

        <section className="data-section">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR ACCOUNTS</p><h2>Accounts</h2></div>
            <button className="icon-button" aria-label="Refresh bank data" title="Refresh bank data" onClick={() => void loadData()} disabled={refreshing}>
              <RefreshCw className={refreshing ? "spin" : ""} size={17} />
            </button>
          </div>
          {accounts.length ? <div className="account-grid">
            {accounts.map((account) => <article className="account-row" key={account.id}>
              <span className="account-icon"><Wallet size={18} /></span>
              <div className="account-details">
                <div className="account-name">{account.name}</div>
                <div className="account-caption">{account.institutionName}{account.mask ? ` ···· ${account.mask}` : ""} · {account.subtype ?? account.type}</div>
              </div>
              <div className="account-balance"><strong>{formatMoney(signedBalance(account.balance, account.type), account.currency)}</strong><span>Current balance</span></div>
            </article>)}
          </div> : <div className="empty-state">
            <span className="empty-icon"><Landmark size={21} /></span>
            <strong>{loading ? "Loading accounts" : "Your accounts will show up here"}</strong>
            <span>{loading ? "Fetching your linked bank information." : "Connect a bank to retrieve balances and recent transactions."}</span>
          </div>}
        </section>

        <section className="data-section transactions-section">
          <div className="section-heading">
            <div><p className="eyebrow">LAST 30 DAYS</p><h2>Recent transactions</h2></div>
            <span className="transaction-count">{transactions.length} transactions</span>
          </div>
          {transactions.length ? <div className="table-wrap"><table>
            <thead><tr><th>MERCHANT</th><th>ACCOUNT</th><th>DATE</th><th className="amount-cell">AMOUNT</th></tr></thead>
            <tbody>{transactions.map((transaction) => {
              const amount = signedTransactionAmount(transaction.amount);
              return <tr key={transaction.id}>
              <td><div className="merchant-cell">
                <span className={`transaction-icon ${amount > 0 ? "money-in" : ""}`}>
                  {amount > 0 ? <ArrowDownLeft size={16} /> : <ArrowDownRight size={16} />}
                </span>
                <span><strong>{transaction.merchant ?? transaction.name}</strong><small>{transaction.category}</small></span>
              </div></td>
              <td className="muted-cell">{transaction.accountName}</td>
              <td className="muted-cell">{formatDate(transaction.date)}</td>
              <td className={`amount-cell ${amount > 0 ? "amount-credit" : ""}`}>
                {amount > 0 ? "+" : "−"}{formatMoney(Math.abs(amount), transaction.currency)}
              </td>
            </tr>;
            })}</tbody>
          </table></div> : <div className="empty-state empty-transactions">
            <span className="empty-icon"><ArrowDownRight size={20} /></span>
            <strong>{loading ? "Loading activity" : "No recent transactions"}</strong>
            <span>{loading ? "Your latest activity is on its way." : "Recent bank activity will appear here once an account is connected."}</span>
          </div>}
        </section>

        <footer className="footer-note"><span className="secure-dot" /> Bank data is retrieved through Plaid. Your bank credentials are never stored here.</footer>
      </section>
    </main>
  );
}