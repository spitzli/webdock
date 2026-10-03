import LoginForm from "../../../components/login-form";
import { Appearance } from "../../../components/navigation";
export default function Login() {
  return (
    <main className="login">
      <section className="login-story">
        <a href="https://webdock.dev" className="brand">
          webdock<span>.</span>
        </a>
        <div>
          <h1>
            A place for
            <br />
            every project.
          </h1>
          <p>The workspace behind the websites.</p>
        </div>
        <p className="login-foot">Built and managed by Spitzli Development.</p>
      </section>
      <section className="login-panel">
        <div>
          <p className="muted">Webdock Admin</p>
          <h2>Welcome back.</h2>
          <p>Sign in to manage your customers and projects.</p>
          <LoginForm />
          <Appearance />
        </div>
      </section>
    </main>
  );
}
