use serde::Serialize;
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

fn args_for_action(action: &str) -> Option<Vec<&'static str>> {
    match action {
        "version" => Some(vec!["--version"]),
        "install" => Some(vec!["install", "--user", "--json"]),
        "uninstall" => Some(vec!["uninstall", "--user", "--json"]),
        "doctor" => Some(vec!["doctor", "--json"]),
        "tools_list" => Some(vec!["tools", "list", "--json"]),
        "skill_status" => Some(vec!["skill", "status", "--json"]),
        "skill_install" => Some(vec!["skill", "install", "--json"]),
        "skill_uninstall" => Some(vec!["skill", "uninstall", "--json"]),
        _ => None,
    }
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
) -> Result<ReadAnyCliRunResult, String> {
    let Some(args) = args_for_action(&action) else {
        return Err(format!("Unsupported ReadAny CLI action: {}", action));
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
            args: args.iter().map(|arg| (*arg).to_string()).collect(),
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
    use super::{args_for_action, bundled_cli_command, resolve_cli_command};
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
        assert_eq!(args_for_action("version"), Some(vec!["--version"]));
        assert_eq!(args_for_action("doctor"), Some(vec!["doctor", "--json"]));
        assert_eq!(
            args_for_action("skill_install"),
            Some(vec!["skill", "install", "--json"])
        );
        assert_eq!(args_for_action("shell"), None);
        assert_eq!(args_for_action("doctor --profile admin"), None);
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
