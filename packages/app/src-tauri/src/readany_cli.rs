use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct ReadAnyCliRunResult {
    ok: bool,
    action: String,
    command: String,
    args: Vec<String>,
    status: Option<i32>,
    stdout: String,
    stderr: String,
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

#[tauri::command]
pub async fn readany_cli_run(action: String) -> Result<ReadAnyCliRunResult, String> {
    let Some(args) = args_for_action(&action) else {
        return Err(format!("Unsupported ReadAny CLI action: {}", action));
    };

    let action_for_result = action.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("readany")
            .args(&args)
            .output()
            .map_err(|error| format!("Failed to run readany: {}", error))?;

        Ok(ReadAnyCliRunResult {
            ok: output.status.success(),
            action: action_for_result,
            command: "readany".to_string(),
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
    use super::args_for_action;

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
}
