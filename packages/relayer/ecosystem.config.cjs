module.exports = {
  apps: [
    {
      name: "simma-relayer",
      cwd: __dirname,
      script: "node",
      args: ["--import", "tsx", "src/index.ts"],
      env: {
        NONCE_STORE: "sqlite",
        RECENTS_STORE: "sqlite",
        RELAYER_DB_PATH: "./data/relayer.db",
        TRUST_PROXY: "false",
        CORS_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX: "120",
      },
    },
    {
      name: "simma-indexer",
      cwd: __dirname,
      script: "node",
      args: ["--import", "tsx", "src/indexIntentExecuted.ts"],
      env: {
        INDEX_STORE: "sqlite",
        RELAYER_DB_PATH: "./data/relayer.db",
        TRUST_PROXY: "false",
        CORS_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX: "120",
        INDEX_POLL_SECONDS: "15",
        INDEX_CHUNK_DELAY_MS: "800",
        INDEX_BACKOFF_429_MS: "10000",
      },
    },
  ],
};
