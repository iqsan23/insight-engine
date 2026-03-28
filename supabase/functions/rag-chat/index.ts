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
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content || "";

    // Step 1: Use AI to extract query parameters (entity extraction)
    const extractionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a query parser. Extract structured filters from natural language queries about employee entry/exit logs. Current date/time: ${new Date().toISOString()}.
Return a JSON object with tool calling.`,
          },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_query_params",
              description: "Extract query parameters from natural language",
              parameters: {
                type: "object",
                properties: {
                  employee_id: { type: "integer", description: "Employee ID if mentioned" },
                  event_type: { type: "string", enum: ["entry", "exit"], description: "Event type if mentioned" },
                  time_start: { type: "string", description: "ISO timestamp for start of time range" },
                  time_end: { type: "string", description: "ISO timestamp for end of time range" },
                  search_text: { type: "string", description: "Key search terms for semantic matching" },
                },
                required: ["search_text"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_query_params" } },
      }),
    });

    if (!extractionResponse.ok) {
      const errText = await extractionResponse.text();
      console.error("Extraction error:", extractionResponse.status, errText);
      
      if (extractionResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (extractionResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const extractionData = await extractionResponse.json();
    let filters: Record<string, unknown> = {};
    try {
      const toolCall = extractionData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        filters = JSON.parse(toolCall.function.arguments);
      }
    } catch (e) {
      console.error("Failed to parse extraction:", e);
    }

    console.log("Extracted filters:", JSON.stringify(filters));

    // Step 2: Query database with extracted filters
    let query = supabase.from("employee_logs").select("*");

    if (filters.employee_id) {
      query = query.eq("employee_id", filters.employee_id);
    }
    if (filters.event_type) {
      query = query.eq("event_type", filters.event_type);
    }
    if (filters.time_start) {
      query = query.gte("timestamp", filters.time_start);
    }
    if (filters.time_end) {
      query = query.lte("timestamp", filters.time_end);
    }

    query = query.order("timestamp", { ascending: false }).limit(20);

    const { data: logs, error: dbError } = await query;

    if (dbError) {
      console.error("DB error:", dbError);
      throw new Error("Database query failed");
    }

    // Step 3: Format retrieved context
    const context = (logs || [])
      .map((log: Record<string, unknown>) => {
        const ts = new Date(log.timestamp as string);
        const timeStr = ts.toLocaleString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });
        return `Employee ${log.employee_id}${log.employee_name ? ` (${log.employee_name})` : ""} ${log.event_type === "entry" ? "entered" : "exited"} ${log.location || "the office"} at ${timeStr}`;
      })
      .join("\n");

    const recordCount = logs?.length || 0;

    // Step 4: Generate response with RAG context (streaming)
    const systemPrompt = `You are an enterprise data assistant for employee access logs. You ONLY answer using the retrieved context below. Do NOT hallucinate or invent data.

RULES:
- If no records are found, say "No records found matching your query."
- Always return precise timestamps, employee IDs, and event types.
- Format responses clearly. Use bullet points for multiple records.
- If asked for a count, provide the exact number.
- Current date/time: ${new Date().toISOString()}

RETRIEVED CONTEXT (${recordCount} records found):
${context || "No matching records found."}`;

    const chatResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!chatResponse.ok) {
      if (chatResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (chatResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await chatResponse.text();
      console.error("Chat error:", chatResponse.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(chatResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("rag-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
