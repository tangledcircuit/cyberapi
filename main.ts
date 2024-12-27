import { serve } from "std/http/server.ts";
import { router } from "./api.ts";

// Serve the API on port 8000
serve(router, { port: 8000 });
