import { NextResponse } from "next/server";
import { initializeVault, isVaultInitialized } from "@/lib/core/vault";

/**
 * POST /api/init — Initialize the vault.
 */
export async function POST() {
  try {
    const alreadyInitialized = await isVaultInitialized();
    await initializeVault();
    return NextResponse.json({
      initialized: true,
      isNew: !alreadyInitialized,
      message: alreadyInitialized ? "Vault already initialized" : "Vault initialized successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initialize vault" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/init — Check if vault is initialized.
 */
export async function GET() {
  const initialized = await isVaultInitialized();
  return NextResponse.json({ initialized });
}
