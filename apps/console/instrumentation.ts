export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getBlakID } = await import("./lib/blakid.ts");
    getBlakID();
  }
}
