/** Keep ingest alive through stray async failures during pool/SEC blips. */
export function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaughtException", err);
  });
}
