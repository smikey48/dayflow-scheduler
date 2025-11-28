// app/api/ping/route.ts
export async function GET() {
  console.log("PING route hit");
  return new Response(
    JSON.stringify({ ok: true, message: "pong" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

