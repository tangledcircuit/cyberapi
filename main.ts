import { serve } from "std/http/server.ts";
import { router } from "./api/router.ts";

// Get port from environment or use default
const port = Number(Deno.env.get("PORT") || "8000");
const hostname = Deno.env.get("DENO_DEPLOYMENT_ID") ? undefined : "localhost";

// Start the server
console.log(`Starting server...`);
await serve(router, { port, hostname });
console.log(`Server running on http://${hostname || ""}:${port}`);

// Export the request handler for Deno Deploy
export default router;
