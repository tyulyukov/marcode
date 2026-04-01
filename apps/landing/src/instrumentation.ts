export async function register() {
  const { validateEnv } = await import("~/lib/validateEnv");
  validateEnv();
}
