// Public endpoint: intentionally unauthenticated for Railway / load-balancer health checks.
// Do NOT add sensitive data (user counts, DB connection strings, env vars) to this response.
// Returns 200 { ok: true } — Railway polls this every 30s to confirm the process is alive.
export async function GET() {
  return Response.json({ ok: true })
}
