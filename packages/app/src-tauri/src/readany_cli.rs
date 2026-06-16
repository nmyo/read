use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct ReadAnyCliRunResult {
    ok: bool,
    action: String,
    command: String,
    command_source: String,
    args: Vec<String>,
    status: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CliCommand {
    program: String,
    prefix_args: Vec<String>,
    source: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAnyCliRunOptions {
    audit_source: Option<String>,
    audit_failed_only: Option<bool>,
    audit_action_prefix: Option<String>,
    audit_date: Option<String>,
    audit_limit: Option<u16>,
    mcp_profile: Option<String>,
    book_id: Option<String>,
    draft_id: Option<String>,
    chapter_id: Option<String>,
    xhtml: Option<String>,
    metadata: Option<EpubMetadataPatchOptions>,
    output_path: Option<String>,
    operation_id: Option<String>,
    reason: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubMetadataPatchOptions {
    title: Option<String>,
    creator: Option<String>,
    language: Option<String>,
    publisher: Option<String>,
    description: Option<String>,
    subjects: Option<Vec<String>>,
}

fn args_for_action(action: &str, options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    match action {
        "version" => Ok(strings(&["--version"])),
        "install" => Ok(strings(&["install", "--user", "--json"])),
        "uninstall" => Ok(strings(&["uninstall", "--user", "--json"])),
        "doctor" => Ok(strings(&["doctor", "--json"])),
        "mcp_config" => mcp_config_args(options),
        "tools_list" => Ok(strings(&["tools", "list", "--json"])),
        "audit_list" => audit_list_args(options),
        "skill_status" => Ok(strings(&["skill", "status", "--json"])),
        "skill_install" => Ok(strings(&["skill", "install", "--json"])),
        "skill_uninstall" => Ok(strings(&["skill", "uninstall", "--json"])),
        "epub_inspect" => epub_inspect_args(options),
        "epub_draft_create" => epub_draft_create_args(options),
        "epub_chapter_read" => epub_chapter_read_args(options),
        "epub_chapter_patch" => epub_chapter_patch_args(options, None),
        "epub_metadata_patch" => epub_metadata_patch_args(options, None),
        "epub_history" => epub_draft_read_args(options, "history", "editor"),
        "epub_diff" => epub_draft_read_args(options, "diff", "editor"),
        "epub_validate" => epub_draft_read_args(options, "validate", "publisher"),
        "epub_export" => epub_export_args(options),
        "epub_toc_rebuild" => epub_toc_rebuild_args(options),
        "epub_undo" => epub_undo_args(options),
        "epub_draft_discard" => epub_draft_discard_args(options),
        _ => Err(format!("Unsupported ReadAny CLI action: {}", action)),
    }
}

fn mcp_config_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let profile = match options.mcp_profile.as_deref().unwrap_or("readonly") {
        "readonly" | "editor" | "publisher" => options.mcp_profile.as_deref().unwrap_or("readonly"),
        _ => return Err("Unsupported MCP profile.".to_string()),
    };
    Ok(vec![
        "mcp".to_string(),
        "config".to_string(),
        "--profile".to_string(),
        profile.to_string(),
        "--json".to_string(),
    ])
}

fn write_temp_file(prefix: &str, extension: &str, content: &[u8]) -> Result<PathBuf, String> {
    let path = temp_patch_path(prefix, extension);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("Failed to prepare temporary patch file: {}", error))?;
    file.write_all(content)
        .map_err(|error| format!("Failed to write temporary patch file: {}", error))?;
    Ok(path)
}

fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

fn audit_list_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let mut args = strings(&["audit", "list", "--json", "--limit"]);
    args.push(options.audit_limit.unwrap_or(8).clamp(1, 50).to_string());

    if let Some(source) = options.audit_source.as_deref() {
        match source {
            "cli" | "mcp" => {
                args.push("--source".to_string());
                args.push(source.to_string());
            }
            _ => return Err("Unsupported audit source filter.".to_string()),
        }
    }

    if options.audit_failed_only.unwrap_or(false) {
        args.push("--failed".to_string());
    }

    if let Some(prefix) = normalized_audit_action_prefix(options.audit_action_prefix.as_deref()) {
        args.push("--action-prefix".to_string());
        args.push(prefix);
    }

    if let Some(date) = options.audit_date.as_deref() {
        if !is_valid_audit_date(date) {
            return Err("Audit date must use YYYY-MM-DD.".to_string());
        }
        args.push("--date".to_string());
        args.push(date.to_string());
    }

    Ok(args)
}

fn epub_draft_create_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let book_id = normalized_entity_id(options.book_id.as_deref(), "book id")?;
    Ok(vec![
        "epub".to_string(),
        "draft".to_string(),
        "create".to_string(),
        book_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_inspect_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let book_id = normalized_entity_id(options.book_id.as_deref(), "book id")?;
    Ok(vec![
        "epub".to_string(),
        "inspect".to_string(),
        book_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_chapter_read_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let chapter_id = normalized_entity_id(options.chapter_id.as_deref(), "chapter id")?;
    Ok(vec![
        "epub".to_string(),
        "chapter".to_string(),
        "read".to_string(),
        draft_id,
        chapter_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--format".to_string(),
        "xhtml".to_string(),
        "--limit".to_string(),
        "50000".to_string(),
        "--json".to_string(),
    ])
}

fn epub_chapter_patch_args(
    options: &ReadAnyCliRunOptions,
    xhtml_path: Option<&Path>,
) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let chapter_id = normalized_entity_id(options.chapter_id.as_deref(), "chapter id")?;
    let xhtml_path = xhtml_path
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "<controlled-temp-xhtml>".to_string());
    Ok(vec![
        "epub".to_string(),
        "chapter".to_string(),
        "patch".to_string(),
        draft_id,
        chapter_id,
        "--xhtml".to_string(),
        xhtml_path,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_metadata_patch_args(
    options: &ReadAnyCliRunOptions,
    patch_path: Option<&Path>,
) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let patch_path = patch_path
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "<controlled-temp-metadata>".to_string());
    Ok(vec![
        "epub".to_string(),
        "metadata".to_string(),
        "patch".to_string(),
        draft_id,
        "--patch".to_string(),
        patch_path,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_draft_read_args(
    options: &ReadAnyCliRunOptions,
    command: &str,
    profile: &str,
) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    Ok(vec![
        "epub".to_string(),
        command.to_string(),
        draft_id,
        "--profile".to_string(),
        profile.to_string(),
        "--json".to_string(),
    ])
}

fn epub_export_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let output_path = normalized_export_path(options.output_path.as_deref())?;
    Ok(vec![
        "epub".to_string(),
        "export".to_string(),
        draft_id,
        "--output".to_string(),
        output_path,
        "--profile".to_string(),
        "publisher".to_string(),
        "--json".to_string(),
    ])
}

fn epub_toc_rebuild_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    Ok(vec![
        "epub".to_string(),
        "toc".to_string(),
        "rebuild".to_string(),
        draft_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_undo_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let operation_id = normalized_entity_id(options.operation_id.as_deref(), "operation id")?;
    Ok(vec![
        "epub".to_string(),
        "undo".to_string(),
        draft_id,
        operation_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ])
}

fn epub_draft_discard_args(options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    let draft_id = normalized_entity_id(options.draft_id.as_deref(), "draft id")?;
    let mut args = vec![
        "epub".to_string(),
        "draft".to_string(),
        "discard".to_string(),
        draft_id,
        "--profile".to_string(),
        "editor".to_string(),
        "--json".to_string(),
    ];
    if let Some(reason) = normalized_reason(options.reason.as_deref()) {
        args.push("--reason".to_string());
        args.push(reason);
    }
    Ok(args)
}

fn normalized_entity_id(value: Option<&str>, label: &str) -> Result<String, String> {
    let value = value.ok_or_else(|| format!("Missing {}.", label))?.trim();
    if value.is_empty() {
        return Err(format!("Missing {}.", label));
    }
    if value.len() > 160 {
        return Err(format!("{} is too long.", label));
    }
    if value.chars().any(char::is_whitespace) {
        return Err(format!("{} must not contain whitespace.", label));
    }
    Ok(value.to_string())
}

fn normalized_reason(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(240).collect())
}

fn normalized_export_path(value: Option<&str>) -> Result<String, String> {
    let value = value
        .ok_or_else(|| "Missing export output path.".to_string())?
        .trim();
    if value.is_empty() {
        return Err("Missing export output path.".to_string());
    }
    if value.len() > 4096 {
        return Err("Export output path is too long.".to_string());
    }
    if !value.to_ascii_lowercase().ends_with(".epub") {
        return Err("EPUB export output path must end with .epub.".to_string());
    }
    Ok(value.to_string())
}

fn normalized_xhtml(value: Option<&str>) -> Result<String, String> {
    let value = value.ok_or_else(|| "Missing XHTML content.".to_string())?;
    if value.trim().is_empty() {
        return Err("Missing XHTML content.".to_string());
    }
    if value.len() > 1_000_000 {
        return Err("XHTML content is too large.".to_string());
    }
    Ok(value.to_string())
}

fn normalized_metadata_patch(value: Option<&EpubMetadataPatchOptions>) -> Result<String, String> {
    let value = value.ok_or_else(|| "Missing metadata patch.".to_string())?;
    let mut patch = EpubMetadataPatchOptions::default();
    patch.title = normalized_optional_text(value.title.as_deref(), 300);
    patch.creator = normalized_optional_text(value.creator.as_deref(), 300);
    patch.language = normalized_optional_text(value.language.as_deref(), 80);
    patch.publisher = normalized_optional_text(value.publisher.as_deref(), 300);
    patch.description = normalized_optional_text(value.description.as_deref(), 4000);
    patch.subjects = normalized_subjects(value.subjects.as_deref());
    if patch.title.is_none()
        && patch.creator.is_none()
        && patch.language.is_none()
        && patch.publisher.is_none()
        && patch.description.is_none()
        && patch.subjects.is_none()
    {
        return Err("Metadata patch must include at least one field.".to_string());
    }
    serde_json::to_string(&patch)
        .map_err(|error| format!("Failed to serialize metadata patch: {}", error))
}

fn normalized_optional_text(value: Option<&str>, max_chars: usize) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(max_chars).collect())
}

fn normalized_subjects(value: Option<&[String]>) -> Option<Vec<String>> {
    let subjects: Vec<String> = value?
        .iter()
        .filter_map(|item| normalized_optional_text(Some(item), 120))
        .take(24)
        .collect();
    if subjects.is_empty() {
        None
    } else {
        Some(subjects)
    }
}

fn temp_patch_path(prefix: &str, extension: &str) -> PathBuf {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    env::temp_dir().join(format!("readany-{}-{}.{}", prefix, id, extension))
}

fn normalized_audit_action_prefix(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(80).collect())
}

fn is_valid_audit_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

fn node_cli_command(script_path: PathBuf, source: &str) -> Option<CliCommand> {
    if !is_executable_file(&script_path) {
        return None;
    }

    Some(CliCommand {
        program: "node".to_string(),
        prefix_args: vec![script_path.to_string_lossy().to_string()],
        source: source.to_string(),
    })
}

fn bundled_cli_command(resource_dir: Option<PathBuf>) -> Option<CliCommand> {
    let resource_dir = resource_dir?;
    node_cli_command(resource_dir.join("readany-cli/bin/readany.js"), "bundle")
}

fn dev_cli_command() -> Option<CliCommand> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    node_cli_command(
        manifest_dir.join("../../cli/dist/bin/readany.js"),
        "workspace",
    )
}

fn env_cli_command() -> Option<CliCommand> {
    let path = env::var("READANY_DESKTOP_CLI_BIN").ok()?;
    let path = PathBuf::from(path);
    node_cli_command(path, "env")
}

fn path_cli_command() -> CliCommand {
    CliCommand {
        program: "readany".to_string(),
        prefix_args: vec![],
        source: "path".to_string(),
    }
}

fn resolve_cli_command(action: &str, resource_dir: Option<PathBuf>) -> CliCommand {
    if let Some(command) = env_cli_command() {
        return command;
    }

    if matches!(action, "install" | "uninstall") {
        if let Some(command) = bundled_cli_command(resource_dir.clone()) {
            return command;
        }
        if let Some(command) = dev_cli_command() {
            return command;
        }
    }

    path_cli_command()
}

#[tauri::command]
pub async fn readany_cli_run(
    app: AppHandle,
    action: String,
    options: Option<ReadAnyCliRunOptions>,
) -> Result<ReadAnyCliRunResult, String> {
    let options = options.unwrap_or_default();
    let temp_patch = if action == "epub_chapter_patch" {
        let xhtml = normalized_xhtml(options.xhtml.as_deref())?;
        Some(write_temp_file("epub-chapter", "xhtml", xhtml.as_bytes())?)
    } else if action == "epub_metadata_patch" {
        let metadata = normalized_metadata_patch(options.metadata.as_ref())?;
        Some(write_temp_file(
            "epub-metadata",
            "json",
            metadata.as_bytes(),
        )?)
    } else {
        None
    };
    let args = if let Some(path) = temp_patch.as_deref() {
        let result = match action.as_str() {
            "epub_chapter_patch" => epub_chapter_patch_args(&options, Some(path)),
            "epub_metadata_patch" => epub_metadata_patch_args(&options, Some(path)),
            _ => args_for_action(&action, &options),
        };
        match result {
            Ok(args) => args,
            Err(error) => {
                let _ = fs::remove_file(path);
                return Err(error);
            }
        }
    } else {
        args_for_action(&action, &options)?
    };

    let resource_dir = app.path().resource_dir().ok();
    let cli_command = resolve_cli_command(&action, resource_dir);
    let action_for_result = action.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(&cli_command.program)
            .args(&cli_command.prefix_args)
            .args(&args)
            .output()
            .map_err(|error| {
                if let Some(path) = temp_patch.as_deref() {
                    let _ = fs::remove_file(path);
                }
                format!(
                    "Failed to run ReadAny CLI via {}: {}",
                    cli_command.source, error
                )
            })?;
        if let Some(path) = temp_patch.as_deref() {
            let _ = fs::remove_file(path);
        }

        Ok(ReadAnyCliRunResult {
            ok: output.status.success(),
            action: action_for_result,
            command: if cli_command.prefix_args.is_empty() {
                cli_command.program
            } else {
                format!(
                    "{} {}",
                    cli_command.program,
                    cli_command.prefix_args.join(" ")
                )
            },
            command_source: cli_command.source,
            args,
            status: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    })
    .await
    .map_err(|error| format!("ReadAny CLI task failed: {}", error))?
}

#[cfg(test)]
mod tests {
    use super::{args_for_action, bundled_cli_command, resolve_cli_command, ReadAnyCliRunOptions};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("readany-cli-{}-{}", name, id));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn exposes_only_allowlisted_cli_actions() {
        assert_eq!(
            args_for_action("version", &ReadAnyCliRunOptions::default()),
            Ok(vec!["--version".to_string()])
        );
        assert_eq!(
            args_for_action("doctor", &ReadAnyCliRunOptions::default()),
            Ok(vec!["doctor".to_string(), "--json".to_string()])
        );
        assert_eq!(
            args_for_action("mcp_config", &ReadAnyCliRunOptions::default()),
            Ok(vec![
                "mcp".to_string(),
                "config".to_string(),
                "--profile".to_string(),
                "readonly".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "mcp_config",
                &ReadAnyCliRunOptions {
                    mcp_profile: Some("publisher".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "mcp".to_string(),
                "config".to_string(),
                "--profile".to_string(),
                "publisher".to_string(),
                "--json".to_string()
            ])
        );
        assert!(args_for_action(
            "mcp_config",
            &ReadAnyCliRunOptions {
                mcp_profile: Some("admin".to_string()),
                ..ReadAnyCliRunOptions::default()
            }
        )
        .is_err());
        assert_eq!(
            args_for_action("audit_list", &ReadAnyCliRunOptions::default()),
            Ok(vec![
                "audit".to_string(),
                "list".to_string(),
                "--json".to_string(),
                "--limit".to_string(),
                "8".to_string()
            ])
        );
        assert_eq!(
            args_for_action("skill_install", &ReadAnyCliRunOptions::default()),
            Ok(vec![
                "skill".to_string(),
                "install".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_inspect",
                &ReadAnyCliRunOptions {
                    book_id: Some("book-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "inspect".to_string(),
                "book-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_draft_create",
                &ReadAnyCliRunOptions {
                    book_id: Some("book-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "draft".to_string(),
                "create".to_string(),
                "book-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_chapter_read",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    chapter_id: Some("chapter-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "chapter".to_string(),
                "read".to_string(),
                "draft-1".to_string(),
                "chapter-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--format".to_string(),
                "xhtml".to_string(),
                "--limit".to_string(),
                "50000".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_chapter_patch",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    chapter_id: Some("chapter-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "chapter".to_string(),
                "patch".to_string(),
                "draft-1".to_string(),
                "chapter-1".to_string(),
                "--xhtml".to_string(),
                "<controlled-temp-xhtml>".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_metadata_patch",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "metadata".to_string(),
                "patch".to_string(),
                "draft-1".to_string(),
                "--patch".to_string(),
                "<controlled-temp-metadata>".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_history",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "history".to_string(),
                "draft-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_diff",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "diff".to_string(),
                "draft-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_validate",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "validate".to_string(),
                "draft-1".to_string(),
                "--profile".to_string(),
                "publisher".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_export",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    output_path: Some("/tmp/readany-out.epub".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "export".to_string(),
                "draft-1".to_string(),
                "--output".to_string(),
                "/tmp/readany-out.epub".to_string(),
                "--profile".to_string(),
                "publisher".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_toc_rebuild",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "toc".to_string(),
                "rebuild".to_string(),
                "draft-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_undo",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    operation_id: Some("op-1".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "undo".to_string(),
                "draft-1".to_string(),
                "op-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string()
            ])
        );
        assert_eq!(
            args_for_action(
                "epub_draft_discard",
                &ReadAnyCliRunOptions {
                    draft_id: Some("draft-1".to_string()),
                    reason: Some("user rejected draft".to_string()),
                    ..ReadAnyCliRunOptions::default()
                }
            ),
            Ok(vec![
                "epub".to_string(),
                "draft".to_string(),
                "discard".to_string(),
                "draft-1".to_string(),
                "--profile".to_string(),
                "editor".to_string(),
                "--json".to_string(),
                "--reason".to_string(),
                "user rejected draft".to_string()
            ])
        );
        assert!(args_for_action("shell", &ReadAnyCliRunOptions::default()).is_err());
        assert!(
            args_for_action("doctor --profile admin", &ReadAnyCliRunOptions::default()).is_err()
        );
    }

    #[test]
    fn validates_epub_draft_create_options() {
        assert!(args_for_action("epub_draft_create", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_inspect", &ReadAnyCliRunOptions::default()).is_err());

        assert!(args_for_action(
            "epub_draft_create",
            &ReadAnyCliRunOptions {
                book_id: Some("book 1".to_string()),
                ..ReadAnyCliRunOptions::default()
            }
        )
        .is_err());
    }

    #[test]
    fn validates_epub_draft_workspace_options() {
        assert!(args_for_action("epub_history", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_chapter_read", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_chapter_patch", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_metadata_patch", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_diff", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_validate", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_export", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_toc_rebuild", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_undo", &ReadAnyCliRunOptions::default()).is_err());
        assert!(args_for_action("epub_draft_discard", &ReadAnyCliRunOptions::default()).is_err());

        let invalid = ReadAnyCliRunOptions {
            draft_id: Some("draft 1".to_string()),
            ..ReadAnyCliRunOptions::default()
        };
        assert!(args_for_action("epub_history", &invalid).is_err());
        assert!(args_for_action("epub_chapter_read", &invalid).is_err());
        assert!(args_for_action("epub_chapter_patch", &invalid).is_err());
        assert!(args_for_action("epub_metadata_patch", &invalid).is_err());
        assert!(args_for_action("epub_diff", &invalid).is_err());
        assert!(args_for_action("epub_validate", &invalid).is_err());
        assert!(args_for_action("epub_export", &invalid).is_err());
        assert!(args_for_action("epub_toc_rebuild", &invalid).is_err());
        assert!(args_for_action("epub_draft_discard", &invalid).is_err());

        assert!(args_for_action(
            "epub_export",
            &ReadAnyCliRunOptions {
                draft_id: Some("draft-1".to_string()),
                output_path: None,
                ..ReadAnyCliRunOptions::default()
            }
        )
        .is_err());

        assert!(args_for_action(
            "epub_export",
            &ReadAnyCliRunOptions {
                draft_id: Some("draft-1".to_string()),
                output_path: Some("/tmp/readany-out.txt".to_string()),
                ..ReadAnyCliRunOptions::default()
            }
        )
        .is_err());

        assert!(args_for_action(
            "epub_undo",
            &ReadAnyCliRunOptions {
                draft_id: Some("draft-1".to_string()),
                operation_id: Some("op 1".to_string()),
                ..ReadAnyCliRunOptions::default()
            }
        )
        .is_err());

        let invalid_chapter = ReadAnyCliRunOptions {
            draft_id: Some("draft-1".to_string()),
            chapter_id: Some("chapter 1".to_string()),
            ..ReadAnyCliRunOptions::default()
        };
        assert!(args_for_action("epub_chapter_read", &invalid_chapter).is_err());
        assert!(args_for_action("epub_chapter_patch", &invalid_chapter).is_err());
    }

    #[test]
    fn validates_epub_chapter_patch_xhtml() {
        use super::normalized_xhtml;

        assert!(normalized_xhtml(None).is_err());
        assert!(normalized_xhtml(Some("   ")).is_err());
        assert_eq!(
            normalized_xhtml(Some("<html><body>ok</body></html>")),
            Ok("<html><body>ok</body></html>".to_string())
        );
        assert!(normalized_xhtml(Some(&"x".repeat(1_000_001))).is_err());
    }

    #[test]
    fn validates_epub_metadata_patch() {
        use super::{normalized_metadata_patch, EpubMetadataPatchOptions};

        assert!(normalized_metadata_patch(None).is_err());
        assert!(normalized_metadata_patch(Some(&EpubMetadataPatchOptions::default())).is_err());
        assert_eq!(
            normalized_metadata_patch(Some(&EpubMetadataPatchOptions {
                title: Some("  A title  ".to_string()),
                creator: Some("Ada".to_string()),
                language: Some("en".to_string()),
                publisher: None,
                description: Some("  ".to_string()),
                subjects: Some(vec!["AI".to_string(), "  ".to_string(), "EPUB".to_string()]),
            })),
            Ok("{\"title\":\"A title\",\"creator\":\"Ada\",\"language\":\"en\",\"publisher\":null,\"description\":null,\"subjects\":[\"AI\",\"EPUB\"]}".to_string())
        );
    }

    #[test]
    fn validates_audit_list_options() {
        let options = ReadAnyCliRunOptions {
            audit_source: Some("mcp".to_string()),
            audit_failed_only: Some(true),
            audit_action_prefix: Some("tools/call".to_string()),
            audit_date: Some("2026-06-16".to_string()),
            audit_limit: Some(500),
            ..ReadAnyCliRunOptions::default()
        };

        assert_eq!(
            args_for_action("audit_list", &options),
            Ok(vec![
                "audit".to_string(),
                "list".to_string(),
                "--json".to_string(),
                "--limit".to_string(),
                "50".to_string(),
                "--source".to_string(),
                "mcp".to_string(),
                "--failed".to_string(),
                "--action-prefix".to_string(),
                "tools/call".to_string(),
                "--date".to_string(),
                "2026-06-16".to_string()
            ])
        );

        let invalid_source = ReadAnyCliRunOptions {
            audit_source: Some("shell".to_string()),
            ..ReadAnyCliRunOptions::default()
        };
        assert!(args_for_action("audit_list", &invalid_source).is_err());

        let invalid_date = ReadAnyCliRunOptions {
            audit_date: Some("2026-6-16".to_string()),
            ..ReadAnyCliRunOptions::default()
        };
        assert!(args_for_action("audit_list", &invalid_date).is_err());
    }

    #[test]
    fn resolves_install_to_bundled_cli_before_path() {
        let root = temp_test_dir("bundle");
        let cli = root.join("readany-cli/bin/readany.js");
        fs::create_dir_all(cli.parent().expect("cli parent")).expect("mkdir");
        fs::write(&cli, "#!/usr/bin/env node\n").expect("write cli");

        let command = resolve_cli_command("install", Some(root.clone()));
        assert_eq!(command.program, "node");
        assert_eq!(command.prefix_args, vec![cli.to_string_lossy().to_string()]);
        assert_eq!(command.source, "bundle");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ignores_missing_bundled_cli() {
        let root = temp_test_dir("missing-bundle");
        assert_eq!(bundled_cli_command(Some(PathBuf::from(&root))), None);
        let _ = fs::remove_dir_all(root);
    }
}
