import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-east4-eqdc4a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const backendVolume = volume("backend-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const backend = service("backend", {
    source: github("fabrithompson/CentroEducativo", { checkSuites: true, rootDirectory: "/" }),
    build: { buildCommand: "pnpm build", buildEnvironment: "V3", builder: "RAILPACK", watchPatterns: ["/web/**", "/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/railway.json", "/.nvmrc"] },
    start: "pnpm start",
    preDeploy: "pnpm --filter backend predespliegue",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    replicas: { "us-east4-eqdc4a": 1 },
    volumeMounts: { "/data": backendVolume },
    env: { CORS_ORIGIN: preserve(), DATABASE_URL: preserve(), JWT_ACCESS_SECRET: preserve(), JWT_REFRESH_SECRET: preserve(), NODE_ENV: preserve(), UPLOAD_DIR: preserve() },
  });

  return project("CentroEducativo", {
    resources: [Postgres, backend, postgresVolume, backendVolume],
  });
});
