// Tool implementations callable from the renderer via Tauri's `invoke()`.
// These are the same primitives as the Electron main-process tools, but
// implemented natively in Rust — no Node runtime needed.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

// ───────────────────────── Errors ─────────────────────────

#[derive(Debug, Serialize)]
pub struct ToolError {
    pub message: String,
}

impl<E: std::fmt::Display> From<E> for ToolError {
    fn from(err: E) -> Self {
        ToolError {
            message: err.to_string(),
        }
    }
}

type ToolResult<T> = Result<T, ToolError>;

// ───────────────────────── Read / Write / Edit ─────────────────────────

#[derive(Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
    #[serde(default)]
    pub offset: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[tauri::command]
pub fn read_file(args: ReadFileArgs) -> ToolResult<String> {
    let path = expand_path(&args.path);
    let file = fs::File::open(&path)?;
    let reader = BufReader::new(file);

    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let start = args.offset.unwrap_or(0);
    let end = args
        .limit
        .map(|l| (start + l).min(lines.len()))
        .unwrap_or(lines.len());

    Ok(lines[start.min(lines.len())..end].join("\n"))
}

#[derive(Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub fn write_file(args: WriteFileArgs) -> ToolResult<()> {
    let path = expand_path(&args.path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, args.content)?;
    Ok(())
}

#[derive(Deserialize)]
pub struct EditFileArgs {
    pub path: String,
    pub old_string: String,
    pub new_string: String,
    #[serde(default)]
    pub replace_all: bool,
}

#[tauri::command]
pub fn edit_file(args: EditFileArgs) -> ToolResult<()> {
    let path = expand_path(&args.path);
    let content = fs::read_to_string(&path)?;

    if !content.contains(&args.old_string) {
        return Err(ToolError {
            message: format!("old_string not found in {}", path.display()),
        });
    }

    let updated = if args.replace_all {
        content.replace(&args.old_string, &args.new_string)
    } else {
        // Only replace first occurrence; require uniqueness for safety.
        if content.matches(&args.old_string).count() > 1 {
            return Err(ToolError {
                message: format!(
                    "old_string appears {} times — use replace_all=true or pass a more unique string",
                    content.matches(&args.old_string).count()
                ),
            });
        }
        content.replacen(&args.old_string, &args.new_string, 1)
    };

    fs::write(&path, updated)?;
    Ok(())
}

#[derive(Deserialize)]
pub struct InsertLinesArgs {
    pub path: String,
    pub line: usize, // 1-indexed
    pub content: String,
}

#[tauri::command]
pub fn insert_lines(args: InsertLinesArgs) -> ToolResult<()> {
    let path = expand_path(&args.path);
    let content = fs::read_to_string(&path)?;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let idx = args.line.saturating_sub(1).min(lines.len());
    for (i, line) in args.content.lines().enumerate() {
        lines.insert(idx + i, line.to_string());
    }
    fs::write(&path, lines.join("\n"))?;
    Ok(())
}

// ───────────────────────── Search ─────────────────────────

#[derive(Deserialize)]
pub struct GlobArgs {
    pub pattern: String,
    #[serde(default)]
    pub path: Option<String>,
}

#[tauri::command]
pub fn glob_search(args: GlobArgs) -> ToolResult<Vec<String>> {
    let root = args
        .path
        .as_deref()
        .map(expand_path)
        .unwrap_or_else(|| PathBuf::from("."));
    let pattern_with_root = format!("{}/{}", root.display(), args.pattern);
    let entries = glob::glob(&pattern_with_root)?
        .filter_map(|res| res.ok())
        .filter(|p| p.is_file())
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>();
    Ok(entries)
}

#[derive(Deserialize)]
pub struct GrepArgs {
    pub pattern: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub glob: Option<String>,
}

#[derive(Serialize)]
pub struct GrepHit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[tauri::command]
pub fn grep_search(args: GrepArgs) -> ToolResult<Vec<GrepHit>> {
    use walkdir::WalkDir;
    let re = regex::Regex::new(&args.pattern)?;
    let root = args
        .path
        .as_deref()
        .map(expand_path)
        .unwrap_or_else(|| PathBuf::from("."));

    let glob_pat = args.glob.as_deref().map(|p| {
        glob::Pattern::new(p).unwrap_or_else(|_| glob::Pattern::new("*").unwrap())
    });

    let mut hits = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            // Skip noisy directories.
            !e.path()
                .components()
                .any(|c| matches!(c.as_os_str().to_str(), Some("node_modules" | ".git" | "dist" | "target")))
        })
    {
        let path = entry.path();
        if let Some(pat) = &glob_pat {
            if !pat.matches_path(path) {
                continue;
            }
        }
        if let Ok(content) = fs::read_to_string(path) {
            for (idx, line) in content.lines().enumerate() {
                if re.is_match(line) {
                    hits.push(GrepHit {
                        path: path.display().to_string(),
                        line: idx + 1,
                        text: line.to_string(),
                    });
                    if hits.len() >= 500 {
                        return Ok(hits);
                    }
                }
            }
        }
    }
    Ok(hits)
}

// ───────────────────────── Bash ─────────────────────────

#[derive(Deserialize)]
pub struct BashArgs {
    pub command: String,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Serialize)]
pub struct BashResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
}

#[tauri::command]
pub fn bash_run(args: BashArgs) -> ToolResult<BashResult> {
    let cwd = args
        .cwd
        .as_deref()
        .map(expand_path)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let mut cmd = Command::new("bash");
    cmd.arg("-lc").arg(&args.command).current_dir(&cwd);

    // Spawn and wait with a timeout.
    let timeout = Duration::from_secs(args.timeout_secs.unwrap_or(120));
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => {
                let output = child.wait_with_output()?;
                return Ok(BashResult {
                    stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                    stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                    exit_code: status.code().unwrap_or(-1),
                    timed_out: false,
                });
            }
            None => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let output = child.wait_with_output()?;
                    return Ok(BashResult {
                        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                        exit_code: -1,
                        timed_out: true,
                    });
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

// ───────────────────────── Auth ─────────────────────────

#[derive(Serialize)]
pub struct AuthRecord {
    pub token: String,
    pub endpoint: String,
    pub email: String,
}

fn auth_path() -> PathBuf {
    let home = dirs_home();
    home.join(".ccr").join("auth.json")
}

fn dirs_home() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home);
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(profile);
    }
    PathBuf::from(".")
}

#[tauri::command]
pub fn read_auth_json() -> ToolResult<Option<AuthRecord>> {
    let path = auth_path();
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)?;
    let token = parsed.get("token").and_then(|v| v.as_str()).unwrap_or_default();
    let endpoint = parsed.get("endpoint").and_then(|v| v.as_str()).unwrap_or_default();
    let email = parsed.get("email").and_then(|v| v.as_str()).unwrap_or_default();
    if token.is_empty() || endpoint.is_empty() {
        return Ok(None);
    }
    Ok(Some(AuthRecord {
        token: token.to_string(),
        endpoint: endpoint.to_string(),
        email: email.to_string(),
    }))
}

#[tauri::command]
pub fn clear_auth_json() -> ToolResult<()> {
    let path = auth_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

// ───────────────────────── Helpers ─────────────────────────

fn expand_path<P: AsRef<str>>(p: P) -> PathBuf {
    let s = p.as_ref();
    if let Some(rest) = s.strip_prefix("~/") {
        return dirs_home().join(rest);
    }
    PathBuf::from(s)
}
