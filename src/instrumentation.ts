/**
 * Instrumentation file for Next.js server startup.
 * Initializes the vault on first server start.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeVault } = await import("@/lib/core/vault");
    try {
      await initializeVault();
      console.log("[Knowledge Wiki] Vault initialized");
    } catch (error) {
      console.error("[Knowledge Wiki] Failed to initialize vault:", error);
    }
  }
}
