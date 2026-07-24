import spectralData from "../spectral-data.json";
import SpectralDashboard from "../SpectralDashboard";
import type { SpectralData } from "../SpectralDashboard";
import {
  chatGPTSignOutPath,
  requireChatGPTUser,
} from "../chatgpt-auth";

export const dynamic = "force-dynamic";

const ALLOWED_EMAILS = new Set(["chiconywang@gmail.com"]);

export default async function DashboardPage() {
  const user = await requireChatGPTUser("/dashboard");

  if (!ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return (
      <main className="denied-shell">
        <section className="denied-card">
          <span className="denied-code">403</span>
          <p className="kicker">ACCOUNT NOT AUTHORIZED</p>
          <h1>该账号尚未获得数据访问权限</h1>
          <p>
            当前登录账号为 <strong>{user.email}</strong>。请使用已授权账号
            `chiconywang@gmail.com`，或由站点所有者更新授权名单。
          </p>
          <a className="login-primary" href={chatGPTSignOutPath("/")}>
            退出并切换账号 <span aria-hidden="true">→</span>
          </a>
        </section>
      </main>
    );
  }

  return (
    <SpectralDashboard
      data={spectralData as unknown as SpectralData}
      currentUser={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
