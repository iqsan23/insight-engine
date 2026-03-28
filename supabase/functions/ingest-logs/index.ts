import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { logs } = await req.json();
    if (!logs || !Array.isArray(logs)) {
      return new Response(JSON.stringify({ error: "logs array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate and insert logs
    const validLogs = logs.map((log: Record<string, unknown>) => ({
      employee_id: Number(log.employee_id),
      employee_name: log.employee_name || null,
      timestamp: log.timestamp || new Date().toISOString(),
      event_type: log.event_type === "exit" ? "exit" : "entry",
      location: log.location || "Main Office",
    }));

    const { data, error } = await supabase
      .from("employee_logs")
      .insert(validLogs)
      .select();

    if (error) {
      console.error("Insert error:", error);
      throw new Error(`Failed to insert logs: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, inserted: data?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ingest-logs error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
