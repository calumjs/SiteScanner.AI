import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import OpenAI from "openai";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://example.com";
const RULE_CONTENT_DIR = process.env.RULE_CONTENT_DIR || "/repo";
const RULE_FOCUS = process.env.RULE_FOCUS || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function runCodexScan(siteUrl, existingIssues = []) {
  const existingIssuesList = existingIssues.length > 0
    ? `\n\nEXISTING ISSUES (DO NOT REPORT THESE AGAIN):\n${existingIssues.map(i => `- "${i.title}" at ${i.source_url} (status: ${i.status})`).join('\n')}`
    : '';

  const instruction = `
You are an autonomous QA bot with access to web search.
- Use your web_search tool to investigate ${siteUrl} and research recent information about the site's content.
- Look for outdated information, incorrect content, broken messaging, or obvious inconsistencies.
- Focus on the main content pages and articles, not just headers/footers.
${existingIssuesList}
- For every concrete issue you find, append it to the "issues" array of the JSON object described by the provided schema. Each issue needs:
  - "title": short slug in sentence case
  - "description": why it is wrong, with evidence from your search
  - "source_url": the specific URL where the issue exists
  - "manualInstructions": optional hints for the fixer (null if none)
- DO NOT report issues that are already listed above in EXISTING ISSUES.
- Your final response MUST strictly match the JSON schema provided (an object with an "issues" array).
- Return {"issues": []} if nothing is wrong or all issues are already reported.
`;

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "codex",
      [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "--enable",
        "web_search_request",
        "-c",
        "sandbox_workspace_write.network_access=true",
        instruction
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "inherit"]
      }
    );

    let raw = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text); // Stream to console in real-time
      raw += text;
    });

    proc.on("close", async (code) => {
      console.log("\n[scanner] Codex completed. Using GPT-5-mini to extract structured JSON...");
      if (code !== 0 && code !== null) {
        console.warn(`[scanner] Codex exited with code ${code}, attempting extraction anyway...`);
      }

      // Send Codex's entire output to GPT-5-mini for structured extraction
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: `You are a JSON extraction assistant. The user will provide raw output from a Codex agent that investigated a website for issues. Extract and return ONLY a valid JSON object with this structure:
{
  "issues": [
    {
      "title": "string",
      "description": "string",
      "source_url": "string",
      "manualInstructions": "string or null"
    }
  ]
}

If no issues are present, return {"issues": []}. Do not include any other text.`
            },
            {
              role: "user",
              content: raw
            }
          ],
          response_format: { type: "json_object" }
        });

        const extracted = completion.choices[0]?.message?.content;
        if (extracted) {
          console.log("[scanner] GPT-5-mini extracted:", extracted);
          const parsed = JSON.parse(extracted);
          if (Array.isArray(parsed?.issues)) {
            resolve(parsed);
            return;
          }
        }
      } catch (err) {
        console.error("[scanner] GPT-5-mini extraction failed:", err.message);
        reject(new Error(`Failed to extract issues via GPT-5-mini: ${err.message}`));
        return;
      }

      reject(new Error(`Codex response did not contain valid issue JSON`));
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn codex: ${err.message}`));
    });
  });
}

const SCANNER_VERSION = "1.1.2";

async function main() {
  console.log(`[scanner v${SCANNER_VERSION}] Fetching existing issues...`);
  
  // Fetch all existing issues BEFORE scanning so we can tell Codex about them
  const { data: existingIssues, error: fetchError } = await supabase
    .from("issues")
    .select("title, source_url, status");
  
  if (fetchError) {
    console.error("Failed to fetch existing issues:", fetchError);
    return;
  }

  console.log(`Found ${existingIssues?.length || 0} existing issues in database`);
  console.log(`[scanner v${SCANNER_VERSION}] Scanning ${SITE_URL} via Codex web search...`);
  
  const findings = await runCodexScan(SITE_URL, existingIssues || []);
  const issues = Array.isArray(findings?.issues)
    ? findings.issues
    : Array.isArray(findings)
      ? findings
      : [];

  console.log("Parsed findings:", JSON.stringify(findings, null, 2));

  if (issues.length === 0) {
    console.log("No issues reported.");
    return;
  }

  for (const finding of issues) {
    const title =
      finding.title ??
      finding.Title ??
      finding.name ??
      "Unlabeled issue";
    let description =
      finding.description ??
      finding.Description ??
      finding.details ??
      null;
    
    // Strip citation markers from description
    if (description) {
      description = description
        .replace(/\bcite\w*\d*\w*/gi, "")
        .replace(/\bturn\w*\d*\w*/gi, "")
        .replace(/\bview\w*\d*\w*/gi, "")
        .replace(/\bsearch\w*\d*\w*/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    
    const sourceUrl =
      finding.source_url ??
      finding.sourceUrl ??
      finding.url ??
      finding.link ??
      null;
    const manualInstructions =
      finding.manualInstructions ??
      finding.manual_instructions ??
      finding.instructions ??
      null;

    const payload = {
      source_url: sourceUrl,
      title,
      description,
      manual_instructions: manualInstructions,
      status: "reported"
    };

    const { error } = await supabase.from("issues").insert(payload);

    if (error) {
      console.error("Failed to insert issue:", error, finding);
    } else {
      console.log("Inserted NEW issue:", title);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
