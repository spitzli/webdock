
import { getRequestI18n } from '@webdock/i18n/next';
import { sso } from "@payload-config";
import { redirect } from "next/navigation";
import LoginForm from "../../../components/login-form";
import { Appearance } from "../../../components/navigation";
export const dynamic = "force-dynamic";

export default async function Login() {
  const i18n = await getRequestI18n();

  if (sso) redirect("/api/sso/login");
  return (
    <main className="login">
      <section className="login-story">
        <a href="https://webdock.dev" className="brand">{i18n.t("webdock")}<span>.</span>
        </a>
        <div>
          <h1>{i18n.t("A place for")}<br />{i18n.t("every project.")}</h1>
          <p>{i18n.t("The workspace behind the websites.")}</p>
        </div>
        <p className="login-foot">{i18n.t("Built and managed by Spitzli Development.")}</p>
      </section>
      <section className="login-panel">
        <div>
          <p className="muted">{i18n.t("Webdock Admin")}</p>
          <h2>{i18n.t("Welcome back.")}</h2>
          <p>{i18n.t("Sign in to manage your customers and projects.")}</p>
          <LoginForm />
          <Appearance />
        </div>
      </section>
    </main>
  );
}
