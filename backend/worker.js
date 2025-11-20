import { createClient } from "@supabase/supabase-js";
import { execSync, spawn } from "child_process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = process.env.WORKER_ID || "worker-1";
const REPO_DIR = process.env.REPO_DIR || "/repo";
const BASE_BRANCH = process.env.BASE_BRANCH || "main";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
}

function cleanupGitLock() {
  const lockPath = `${REPO_DIR}/.git/index.lock`;
  try {
    execSync(`rm -f ${lockPath}`, { stdio: "ignore" });
    console.log("Cleaned up stale git lock file");
  } catch {
    // Ignore if file doesn't exist
  }
}

function runCodex(prompt) {
  console.log(`> codex exec --sandbox workspace-write [prompt]`);
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "codex",
      [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "--enable",
        "web_search_request",
        "-s",
        "workspace-write",
        prompt
      ],
      {
        cwd: REPO_DIR,
        env: process.env,
        stdio: ["ignore", "pipe", "inherit"]
      }
    );

    proc.stdout.on("data", (chunk) => {
      process.stdout.write(chunk.toString());
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Codex exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn codex: ${err.message}`));
    });
  });
}

async function claimIssue() {
  const { data, error } = await supabase.rpc("claim_issue", {
    worker_id: WORKER_ID
  });

  if (error) {
    console.error("claim_issue error:", error);
    return null;
  }

  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}

async function updateIssue(id, patch) {
  const { error } = await supabase.from("issues").update(patch).eq("id", id);
  if (error) console.error("updateIssue error:", error);
}

async function processIssue(issue) {
  console.log("Processing issue", issue.id, issue.title);
  const branchName = `auto/${issue.id}`;

  try {
    run("git fetch origin");
    run(`git checkout ${BASE_BRANCH}`);
    run(`git pull origin ${BASE_BRANCH}`);
    run(`git checkout -B ${branchName}`);

    const prompt = `
You are maintaining the website repo at ${REPO_DIR}.
You have access to web_search to verify facts before making changes.

Issue JSON:
${JSON.stringify(issue, null, 2)}

Manual instructions (if any):
${issue.manual_instructions ?? "None."}

Task:
- Understand the SPECIFIC issue described above. Use web_search if you need to verify facts or get current information.
- Make minimal, high-quality changes to fix ONLY this specific issue.
- DO NOT investigate or fix other issues you may notice - stay focused on the reported issue only.
- Keep your changes minimal and targeted to the specific problem.
`;

    await runCodex(prompt);

    // Clean up any stale git lock files left by Codex
    cleanupGitLock();

    // Check if there are any changes (staged or unstaged)
    const status = run("git status --porcelain");
    if (!status) {
      console.log("No changes from Codex; marking as failed.");
      await updateIssue(issue.id, {
        status: "failed",
        error_message: "No changes were produced by Codex for this issue."
      });
      return;
    }

    // Stage any remaining unstaged changes (Codex may have already staged some)
    run("git add .");
    run(`git commit -m "Fix issue ${issue.id}: ${issue.title}"`);
    run(`git push -u origin ${branchName}`);

    const prOutput = run(
      `gh pr create --head ${branchName} --base ${BASE_BRANCH} --title "Fix: ${issue.title}" --body "Automatically generated fix for issue ${issue.id}."`
    );

    const prUrl =
      prOutput
        .split("\n")
        .find(line => line.includes("http")) ?? prOutput;

    await updateIssue(issue.id, {
      status: "pr_raised",
      pr_url: prUrl
    });
  } catch (error) {
    console.error("Error processing issue:", error);
    await updateIssue(issue.id, {
      status: "failed",
      error_message: String(error).slice(0, 2000)
    });
  }
}

const EMPTY_SLEEP_MS = parseInt(process.env.WORKER_IDLE_SLEEP_MS || "60000", 10);
const ERROR_SLEEP_MS = parseInt(process.env.WORKER_ERROR_SLEEP_MS || "10000", 10);

async function main() {
  while (true) {
    try {
      const issue = await claimIssue();
      if (!issue || !issue.id) {
        console.log(`No approved issues. Sleeping ${EMPTY_SLEEP_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, EMPTY_SLEEP_MS));
        continue;
      }

      await processIssue(issue);
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise(resolve => setTimeout(resolve, ERROR_SLEEP_MS));
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

