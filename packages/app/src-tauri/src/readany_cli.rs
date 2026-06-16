use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
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
}

fn args_for_action(action: &str, options: &ReadAnyCliRunOptions) -> Result<Vec<String>, String> {
    match action {
        "version" => Ok(strings(&["--version"])),
        "install" => Ok(strings(&["install", "--user", "--json"])),
        "uninstall" => Ok(strings(&["uninstall", "--user", "--json"])),
        "doctor" => Ok(strings(&["doctor", "--json"])),
        "tools_list" => Ok(strings(&["tools", "list", "--json"])),
        "audit_list" => audit_list_args(options),
        "skill_status" => Ok(strings(&["skill", "status", "--json"])),
        "skill_install" => Ok(strings(&["skill", "install", "--json"])),
        "skill_uninstall" => Ok(strings(&["skill", "uninstall", "--json"])),
        _ => Err(format!("Unsupported ReadAny CLI action: {}", action)),
    }
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
    let args = args_for_action(&action, &options)?;

    let resource_dir = app.path().resource_dir().ok();
    let cli_command = resolve_cli_command(&action, resource_dir);
    let action_for_result = action.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(&cli_command.program)
            .args(&cli_command.prefix_args)
            .args(&args)
            .output()
            .map_err(|error| {
                format!(
                    "Failed to run ReadAny CLI via {}: {}",
                    cli_command.source, error
                )
            })?;

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
        assert!(args_for_action("shell", &ReadAnyCliRunOptions::default()).is_err());
        assert!(
            args_for_action("doctor --profile admin", &ReadAnyCliRunOptions::default()).is_err()
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
