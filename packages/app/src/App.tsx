import { useEffect, useMemo, useState } from "react";

type Health = {
  ok: boolean;
  relayer: string;
  settlement: string;
  chainId: number;
};

type RecentIntentsResp = {
  ok: boolean;
  count: number;
  intents: Array<{
    chainId: number;
    blockNumber: number;
    txHash: string;
    logIndex: number;
    signer: string;
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    feePaid: string;
    nonce: string;
  }>;
};

type BalancesResp = {
  ok: boolean;
  chainId: number;
  signer: string;
  settlement: string;
  tokens: Array<{
    token: string;
    decimalsHint: number | null;
    balance: string;
    allowance: string;
  }>;
};

type BuildIntentResp = {
  chainId: number;
  intent: any;
};

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUnits(raw: string, decimals: number | null) {
  if (decimals === null) return raw;
  // minimal formatting: show decimal point without big-number libs
  const s = raw.replace(/^0+/, "") || "0";
  if (decimals === 0) return s;
  const pad = s.padStart(decimals + 1, "0");
  const whole = pad.slice(0, -decimals);
  const frac = pad.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string>("");

  const [recent, setRecent] = useState<RecentIntentsResp | null>(null);
  const [recentErr, setRecentErr] = useState<string>("");

  const [signer, setSigner] = useState<string>("0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53");
  const [balances, setBalances] = useState<BalancesResp | null>(null);
  const [balErr, setBalErr] = useState<string>("");

  const [buildTokenIn, setBuildTokenIn] = useState<string>("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC
  const [buildTokenOut, setBuildTokenOut] = useState<string>("0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156"); // SIMMA
  const [buildAmountIn, setBuildAmountIn] = useState<string>("500000"); // raw
  const [built, setBuilt] = useState<BuildIntentResp | null>(null);
  const [buildErr, setBuildErr] = useState<string>("");

  const relayerBase = useMemo(() => "", []); // proxied by Vite, so base is same-origin

  async function fetchHealth() {
    setHealthErr("");
    try {
      const r = await fetch(`${relayerBase}/health`);
      const j = (await r.json()) as Health;
      setHealth(j);
    } catch (e: any) {
      setHealth(null);
      setHealthErr(e?.message || String(e));
    }
  }

  async function fetchRecent() {
    setRecentErr("");
    try {
      const r = await fetch(`${relayerBase}/v1/recent-intents?limit=50`);
      const j = (await r.json()) as RecentIntentsResp;
      setRecent(j);
    } catch (e: any) {
      setRecent(null);
      setRecentErr(e?.message || String(e));
    }
  }

  async function fetchBalances() {
    setBalErr("");
    try {
      const r = await fetch(`${relayerBase}/v1/balances?signer=${encodeURIComponent(signer)}`);
      const j = (await r.json()) as BalancesResp;
      setBalances(j);
    } catch (e: any) {
      setBalances(null);
      setBalErr(e?.message || String(e));
    }
  }

  async function buildIntent() {
    setBuildErr("");
    setBuilt(null);
    try {
      const r = await fetch(`${relayerBase}/v1/build-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signer,
          tokenIn: buildTokenIn,
          tokenOut: buildTokenOut,
          amountIn: buildAmountIn,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setBuildErr(j?.error || "build-intent failed");
        return;
      }
      setBuilt(j as BuildIntentResp);
    } catch (e: any) {
      setBuildErr(e?.message || String(e));
    }
  }

  function downloadBuiltJson() {
    if (!built) return;
    const blob = new Blob([JSON.stringify(built, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "built_intent.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    fetchHealth();
    fetchRecent();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1>SIMMA Relayer Dashboard</h1>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2>Health</h2>
        <button onClick={fetchHealth}>Refresh</button>
        {healthErr && <p style={{ color: "crimson" }}>{healthErr}</p>}
        {health && (
          <ul>
            <li>ok: <b>{String(health.ok)}</b></li>
            <li>chainId: <b>{health.chainId}</b></li>
            <li>relayer: <code>{health.relayer}</code></li>
            <li>settlement: <code>{health.settlement}</code></li>
          </ul>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2>Recent IntentExecuted</h2>
        <button onClick={fetchRecent}>Refresh</button>
        {recentErr && <p style={{ color: "crimson" }}>{recentErr}</p>}
        {recent && (
          <>
            <p>count: <b>{recent.count}</b></p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {["block", "tx", "signer", "tokenIn", "tokenOut", "amountIn", "amountOut", "feePaid", "nonce"].map((h) => (
                      <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 8px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.intents.map((it) => (
                    <tr key={`${it.txHash}:${it.logIndex}`}>
                      <td style={{ padding: "6px 8px" }}>{it.blockNumber}</td>
                      <td style={{ padding: "6px 8px" }}><code title={it.txHash}>{shortAddr(it.txHash)}</code></td>
                      <td style={{ padding: "6px 8px" }}><code title={it.signer}>{shortAddr(it.signer)}</code></td>
                      <td style={{ padding: "6px 8px" }}><code title={it.tokenIn}>{shortAddr(it.tokenIn)}</code></td>
                      <td style={{ padding: "6px 8px" }}><code title={it.tokenOut}>{shortAddr(it.tokenOut)}</code></td>
                      <td style={{ padding: "6px 8px" }}>{it.amountIn}</td>
                      <td style={{ padding: "6px 8px" }}>{it.amountOut}</td>
                      <td style={{ padding: "6px 8px" }}>{it.feePaid}</td>
                      <td style={{ padding: "6px 8px" }}>{it.nonce}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <h2>Balances & Allowances</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            signer:{" "}
            <input style={{ width: 420 }} value={signer} onChange={(e) => setSigner(e.target.value)} />
          </label>
          <button onClick={fetchBalances}>Fetch</button>
        </div>
        {balErr && <p style={{ color: "crimson" }}>{balErr}</p>}
        {balances && (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["token", "decimals", "balance(raw)", "balance", "allowance(raw)"].map((h) => (
                    <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 8px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.tokens.map((t) => (
                  <tr key={t.token}>
                    <td style={{ padding: "6px 8px" }}><code title={t.token}>{t.token}</code></td>
                    <td style={{ padding: "6px 8px" }}>{t.decimalsHint ?? "-"}</td>
                    <td style={{ padding: "6px 8px" }}>{t.balance}</td>
                    <td style={{ padding: "6px 8px" }}>{formatUnits(t.balance, t.decimalsHint)}</td>
                    <td style={{ padding: "6px 8px" }}>{t.allowance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <h2>Build Intent</h2>
        <p>This calls <code>/v1/build-intent</code> and produces JSON you can download + sign with your keystore script.</p>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, maxWidth: 900 }}>
          <div>signer</div>
          <input value={signer} onChange={(e) => setSigner(e.target.value)} />

          <div>tokenIn</div>
          <input value={buildTokenIn} onChange={(e) => setBuildTokenIn(e.target.value)} />

          <div>tokenOut</div>
          <input value={buildTokenOut} onChange={(e) => setBuildTokenOut(e.target.value)} />

          <div>amountIn (raw)</div>
          <input value={buildAmountIn} onChange={(e) => setBuildAmountIn(e.target.value)} />
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button onClick={buildIntent}>Build</button>
          <button onClick={downloadBuiltJson} disabled={!built}>Download JSON</button>
        </div>

        {buildErr && <p style={{ color: "crimson" }}>{buildErr}</p>}

        {built && (
          <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 12, marginTop: 10, overflowX: "auto" }}>
{JSON.stringify(built, null, 2)}
          </pre>
        )}
      </section>

      <p style={{ marginTop: 16, color: "#666" }}>
        Tip: keep the relayer running on <code>localhost:8787</code>. This UI proxies <code>/health</code> and <code>/v1/*</code> to it.
      </p>
    </div>
  );
}
