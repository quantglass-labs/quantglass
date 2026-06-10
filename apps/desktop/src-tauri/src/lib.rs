// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Default base URL used when no managed sidecar is running (e.g. during
/// `tauri dev` with a developer-launched backend on the conventional port).
const FALLBACK_BASE_URL: &str = "http://127.0.0.1:8000";

/// Runtime state describing how the frontend should reach the backend and,
/// when we started it ourselves, a handle so we can shut it down on exit.
struct BackendState {
    base_url: String,
    child: Mutex<Option<CommandChild>>,
}

/// Ask the OS for a free loopback port by binding to port 0 and reading back
/// the assigned port, then releasing it for the backend to claim.
fn pick_free_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

/// Block until the backend returns a healthy HTTP response on `port`, or the
/// timeout elapses. A listening TCP port alone is not enough because uvicorn
/// may accept sockets before the application can serve routes.
fn wait_for_backend_health(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

            if stream
                .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
                .is_ok()
            {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains("200 OK")
                    && response.contains("\"status\":\"ok\"")
                {
                    return true;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// Resolve the source checkout root when running the Tauri shell from this repo.
/// The backend uses this to discover local extension packs under ./extensions.
fn workspace_root() -> Option<String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .map(|path| path.to_string_lossy().to_string())
}

/// Exposed to the frontend so it can target the backend the shell launched.
#[tauri::command]
fn backend_base_url(state: tauri::State<'_, BackendState>) -> String {
    state.base_url.clone()
}

#[tauri::command]
fn save_json_export(path: String, contents: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create export directory: {error}"))?;
    }
    fs::write(&path, contents).map_err(|error| format!("Could not write export file: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// Launch the bundled backend sidecar on a free port. Returns the resolved
/// base URL and a child handle when the sidecar starts successfully.
fn start_backend(app: &tauri::App) -> (String, Option<CommandChild>) {
    let port = match pick_free_port() {
        Some(port) => port,
        None => return (FALLBACK_BASE_URL.to_string(), None),
    };

    let mut command = match app.shell().sidecar("quantglass-backend") {
        Ok(command) => command.args(["--host", "127.0.0.1", "--port", &port.to_string()]),
        Err(error) => {
            eprintln!("[backend] sidecar unavailable, using fallback URL: {error}");
            return (FALLBACK_BASE_URL.to_string(), None);
        }
    };
    if let Some(root) = workspace_root() {
        command = command.env("QUANTGLASS_WORKSPACE_ROOT", root);
    }

    match command.spawn() {
        Ok((mut rx, child)) => {
            // Continuously drain stdout/stderr so the pipe never fills and
            // stalls the child process.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[backend] terminated: {payload:?}");
                        }
                        _ => {}
                    }
                }
            });

            if wait_for_backend_health(port, Duration::from_secs(30)) {
                (format!("http://127.0.0.1:{port}"), Some(child))
            } else {
                eprintln!("[backend] sidecar did not become healthy, using fallback URL");
                let _ = child.kill();
                (FALLBACK_BASE_URL.to_string(), None)
            }
        }
        Err(error) => {
            eprintln!("[backend] failed to spawn sidecar, using fallback URL: {error}");
            (FALLBACK_BASE_URL.to_string(), None)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![backend_base_url, save_json_export])
        .setup(|app| {
            let (base_url, child) = start_backend(app);
            app.manage(BackendState {
                base_url,
                child: Mutex::new(child),
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running QuantGlass")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<BackendState>() {
                    if let Some(child) = state.child.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
