// Public endpoint: intentionally unauthenticated for Railway / load-balancer health checks.
// Do NOT add sensitive data (user counts, DB connection strings, env vars) to this response.
export async function GET() {
  return Response.json({ ok: true })
}
