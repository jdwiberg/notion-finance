import Dashboard from "./dashboard";

export default function Home() {
  return <Dashboard plaidEnvironment={process.env.PLAID_ENV ?? "sandbox"} />;
}