// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

use std::net::{TcpListener, TcpStream};
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

/// Block until the backend accepts TCP connections on `port`, or the timeout
/// elapses. Keeps the window from issuing requests before the API is ready.
fn wait_for_port(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// Exposed to the frontend so it can target the backend the shell launched.
#[tauri::command]
fn backend_base_url(state: tauri::State<'_, BackendState>) -> String {
    state.base_url.clone()
}

/// Launch the bundled backend sidecar on a free port. Returns the resolved
/// base URL and a child handle when the sidecar starts successfully.
fn start_backend(app: &tauri::App) -> (String, Option<CommandChild>) {
    let port = match pick_free_port() {
        Some(port) => port,
        None => return (FALLBACK_BASE_URL.to_string(), None),
    };

    let command = match app.shell().sidecar("quantglass-backend") {
        Ok(command) => command.args(["--host", "127.0.0.1", "--port", &port.to_string()]),
        Err(error) => {
            eprintln!("[backend] sidecar unavailable, using fallback URL: {error}");
            return (FALLBACK_BASE_URL.to_string(), None);
        }
    };

    match command.spawn() {
        Ok((mut rx, child)) => {
            // Continuously drain stdout/stderr so the pipe never fills and
            // stalls the child process.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
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

            wait_for_port(port, Duration::from_secs(30));
            (format!("http://127.0.0.1:{port}"), Some(child))
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
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![backend_base_url])
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
