import { FormEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import SpectralDashboard, {
  type SpectralData,
} from "../../app/SpectralDashboard";
import "../../app/globals.css";
import "./pages.css";

type EncryptedPayload = {
  version: number;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  return Uint8Array.from(
    decoded,
    (character) => character.charCodeAt(0),
  ) as Uint8Array<ArrayBuffer>;
}

async function decryptData(password: string): Promise<SpectralData> {
  const response = await fetch("./spectral-data.enc.json", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("encrypted-data-unavailable");
  }

  const payload = (await response.json()) as EncryptedPayload;
  if (
    payload.version !== 1 ||
    payload.algorithm !== "AES-GCM" ||
    payload.kdf !== "PBKDF2-SHA256"
  ) {
    throw new Error("unsupported-encryption");
  }

  const passwordMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64(payload.salt),
      iterations: payload.iterations,
    },
    passwordMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(payload.iv),
    },
    key,
    fromBase64(payload.ciphertext),
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as SpectralData;
}

function EncryptedGate() {
  const [data, setData] = useState<SpectralData | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "decrypting" | "invalid" | "unavailable"
  >("idle");

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || status === "decrypting") return;

    setStatus("decrypting");
    try {
      const decrypted = await decryptData(password);
      setPassword("");
      setData(decrypted);
      setStatus("idle");
    } catch (error) {
      console.error(error);
      setStatus(
        error instanceof Error &&
          error.message === "encrypted-data-unavailable"
          ? "unavailable"
          : "invalid",
      );
      setPassword("");
    }
  };

  if (data) {
    return (
      <SpectralDashboard
        data={data}
        currentUser={{
          displayName: "授权访客",
          email: "GitHub Pages 加密访问",
        }}
        signOutPath="./"
      />
    );
  }

  return (
    <main className="gh-gate-shell">
      <div className="gh-gate-grid" aria-hidden="true" />
      <section className="gh-gate-panel">
        <div className="gh-gate-brand">
          <span className="gh-gate-mark">SA</span>
          <span>
            <strong>Spectra Atlas</strong>
            <small>材料表征数据中枢</small>
          </span>
        </div>

        <div className="gh-gate-copy">
          <p className="gh-gate-kicker">ENCRYPTED DATA WORKSPACE</p>
          <h1>
            输入访问密码，
            <br />
            <span>在浏览器内解锁光谱。</span>
          </h1>
          <p>
            Raman、UV–VIS、FTIR 与 XPS 数据采用 AES-256-GCM
            加密保存。密码不会发送到 GitHub 或任何服务器。
          </p>
        </div>

        <form className="gh-gate-form" onSubmit={unlock}>
          <label htmlFor="access-password">访问密码</label>
          <input
            id="access-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            aria-describedby="password-help password-status"
          />
          <button type="submit" disabled={status === "decrypting"}>
            {status === "decrypting" ? "正在验证与解密…" : "进入数据工作台 →"}
          </button>
          <p id="password-help">
            密码只参与本机解密；刷新或关闭页面后需要重新输入。
          </p>
          <p
            id="password-status"
            className="gh-gate-status"
            role="status"
            aria-live="polite"
          >
            {status === "invalid"
              ? "密码不正确，请重新输入。"
              : status === "unavailable"
                ? "暂时无法读取加密数据，请稍后刷新重试。"
                : ""}
          </p>
        </form>

        <footer className="gh-gate-foot">
          <span>
            <i />
            CLIENT-SIDE DECRYPTION
          </span>
          <span>READ-ONLY SPECTRAL DATA</span>
        </footer>
      </section>

      <aside className="gh-gate-visual" aria-hidden="true">
        <div className="gh-gate-visual-head">
          <span>PROTECTED SPECTRA</span>
          <span>AES-256-GCM</span>
        </div>
        <div className="gh-gate-orbit">
          <div>
            <strong>SA</strong>
            <span>LOCKED</span>
          </div>
          <i className="gh-dot gh-dot-one" />
          <i className="gh-dot gh-dot-two" />
          <i className="gh-dot gh-dot-three" />
          <i className="gh-dot gh-dot-four" />
        </div>
        <div className="gh-techniques">
          {[
            ["RA", "Raman"],
            ["UV", "UV–VIS–NIR"],
            ["IR", "FTIR"],
            ["XP", "XPS"],
          ].map(([code, name]) => (
            <div key={code}>
              <span>{code}</span>
              <strong>{name}</strong>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<EncryptedGate />);
