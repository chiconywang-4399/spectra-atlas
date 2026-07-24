import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await getChatGPTUser();

  return (
    <main className="login-shell">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">SA</span>
          <span>
            <strong>Spectra Atlas</strong>
            <small>材料表征数据中枢</small>
          </span>
        </div>

        <div className="login-copy">
          <p className="kicker">SECURE DATA WORKSPACE</p>
          <h1>
            实验数据，
            <br />
            <span>仅向授权账号开放。</span>
          </h1>
          <p>
            登录后可浏览 Raman、UV–VIS、FTIR 与 XPS 光谱，
            进行曲线叠加、悬停读数和分峰结果复核。
          </p>
        </div>

        {user ? (
          <div className="login-account">
            <span className="account-avatar">
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <small>已登录</small>
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
            </div>
            <a className="login-primary" href="/dashboard">
              进入数据工作台 <span aria-hidden="true">→</span>
            </a>
            <a className="login-secondary" href={chatGPTSignOutPath("/")}>
              切换账号
            </a>
          </div>
        ) : (
          <div className="login-actions">
            <a className="login-primary" href={chatGPTSignInPath("/dashboard")}>
              使用 ChatGPT 账号登录 <span aria-hidden="true">→</span>
            </a>
            <p>
              登录由 ChatGPT 安全完成；网站不会接触或保存你的密码。
            </p>
          </div>
        )}

        <div className="login-foot">
          <span>
            <i />
            AUTHENTICATION REQUIRED
          </span>
          <span>READ-ONLY SPECTRAL DATA</span>
        </div>
      </section>

      <aside className="login-visual" aria-hidden="true">
        <div className="login-visual-head">
          <span>PROTECTED SPECTRA</span>
          <span>4 TECHNIQUES</span>
        </div>
        <div className="login-orbit">
          <div className="orbit-core">
            <strong>SA</strong>
            <span>SECURE</span>
          </div>
          <i className="orbit-dot dot-one" />
          <i className="orbit-dot dot-two" />
          <i className="orbit-dot dot-three" />
          <i className="orbit-dot dot-four" />
        </div>
        <div className="login-techniques">
          {[
            ["RA", "Raman", "Vibrational"],
            ["UV", "UV–VIS–NIR", "Optical"],
            ["IR", "FTIR", "Vibrational"],
            ["XP", "XPS", "Surface"],
          ].map(([code, name, type]) => (
            <div key={code}>
              <span>{code}</span>
              <strong>{name}</strong>
              <small>{type}</small>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
