use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use eventsource_stream::Eventsource;
use serde_json::Value;

// ── OAuth Constants (matching CLIProxyAPI internal/auth/antigravity/constants.go) ──
const CLIENT_ID: &str = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";
const CALLBACK_PORT: u16 = 51121;
const OAUTH_SCOPES: &str = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs";

// ── API Constants ──
const API_ENDPOINT: &str = "https://cloudcode-pa.googleapis.com";
const API_DAILY_ENDPOINT: &str = "https://daily-cloudcode-pa.googleapis.com";
const API_VERSION: &str = "v1internal";
const API_USER_AGENT: &str = "google-api-nodejs-client/9.15.1";
const API_CLIENT: &str = "google-cloud-sdk vscode_cloudshelleditor/0.1";
const STREAM_USER_AGENT: &str = "antigravity/1.19.6 darwin/arm64";

// ── Login Response ──
#[derive(Serialize)]
struct LoginResult {
    access_token: String,
    refresh_token: String,
    project_id: String,
}

#[tauri::command]
async fn login_oauth_proxy(app: tauri::AppHandle) -> Result<String, String> {
    let server = Server::http(format!("127.0.0.1:{}", CALLBACK_PORT)).map_err(|e| e.to_string())?;

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&client_id={}&prompt=consent&redirect_uri=http://localhost:{}/oauth2callback&response_type=code&scope={}",
        CLIENT_ID,
        CALLBACK_PORT,
        OAUTH_SCOPES.replace(' ', "%20")
    );

    app.opener().open_url(&auth_url, None::<&str>).map_err(|e| e.to_string())?;

    let auth_code = tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        loop {
            if start.elapsed().as_secs() > 120 {
                return Err("Timeout login OAuth: Pengguna tidak menyelesaikan login dalam 2 menit.".to_string());
            }
            if let Ok(Some(request)) = server.try_recv() {
                let url = request.url();
                if url.starts_with("/oauth2callback") {
                    let mut code_val = String::new();
                    if let Some(query) = url.split('?').nth(1) {
                        for param in query.split('&') {
                            if param.starts_with("code=") {
                                let raw_code = param.trim_start_matches("code=");
                                code_val = raw_code.replace("%2F", "/").replace("%2f", "/")
                                                   .replace("%3D", "=").replace("%3d", "=")
                                                   .replace("%2B", "+").replace("%2b", "+");
                            }
                        }
                    }
                    
                    let html = r#"
                    <!DOCTYPE html><html><body style="background:#0b0d11;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                    <div style="text-align:center;"><h2>Login Berhasil</h2><p>Silakan tutup tab ini dan kembali ke aplikasi VocaCode Anda.</p>
                    <script>
                         setTimeout(() => window.close(), 2000);
                    </script></div></body></html>"#;

                    let mut response = Response::from_string(html);
                    response.add_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                    let _ = request.respond(response);
                    
                    return Ok(code_val);
                } else {
                    let response = Response::from_string("Not Found").with_status_code(404);
                    let _ = request.respond(response);
                }
            } else {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
    }).await.map_err(|e| e.to_string())??;

    if auth_code.is_empty() {
        return Err("Authorization code failed".into());
    }

    // ── Step 1: Exchange code for tokens ──
    #[derive(Serialize)]
    struct TokenRequest {
        client_id: String,
        client_secret: String,
        code: String,
        grant_type: String,
        redirect_uri: String,
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        #[serde(default)]
        refresh_token: String,
    }

    let client = Client::new();
    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&TokenRequest {
            client_id: CLIENT_ID.into(),
            client_secret: CLIENT_SECRET.into(),
            code: auth_code,
            grant_type: "authorization_code".into(),
            redirect_uri: format!("http://localhost:{}/oauth2callback", CALLBACK_PORT),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token Exchange Error: {}", err_text));
    }

    let token_data: TokenResponse = res.json().await.map_err(|e| e.to_string())?;

    // ── Step 2: Fetch project_id via loadCodeAssist ──
    let project_id = fetch_project_id_internal(&client, &token_data.access_token).await
        .unwrap_or_default();

    // ── Return JSON with all auth data ──
    let result = LoginResult {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token,
        project_id,
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

/// Fetch the user's cloudaicompanionProject via loadCodeAssist endpoint
/// (matching CLIProxyAPI internal/auth/antigravity/auth.go:FetchProjectID)
async fn fetch_project_id_internal(client: &Client, access_token: &str) -> Result<String, String> {
    let load_url = format!("{}/{}:loadCodeAssist", API_ENDPOINT, API_VERSION);

    let body = serde_json::json!({
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI"
        }
    });

    let res = client.post(&load_url)
        .bearer_auth(access_token)
        .header("Content-Type", "application/json")
        .header("User-Agent", API_USER_AGENT)
        .header("X-Goog-Api-Client", API_CLIENT)
        .header("Client-Metadata", r#"{"ideType":"ANTIGRAVITY","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}"#)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("loadCodeAssist request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("loadCodeAssist error: {}", err_text));
    }

    let json: Value = res.json().await.map_err(|e| format!("loadCodeAssist parse error: {}", e))?;

    // Extract cloudaicompanionProject — can be string or object with "id"
    if let Some(project) = json.get("cloudaicompanionProject") {
        if let Some(s) = project.as_str() {
            if !s.trim().is_empty() {
                return Ok(s.trim().to_string());
            }
        }
        if let Some(id) = project.get("id").and_then(|v| v.as_str()) {
            if !id.trim().is_empty() {
                return Ok(id.trim().to_string());
            }
        }
    }

    // No project found — user needs onboarding
    // Extract default tier ID from allowedTiers (matching CLIProxyAPI auth.go:FetchProjectID)
    let mut tier_id = "legacy-tier".to_string();
    if let Some(tiers) = json.get("allowedTiers").and_then(|t| t.as_array()) {
        for tier in tiers {
            if tier.get("isDefault").and_then(|v| v.as_bool()).unwrap_or(false) {
                if let Some(id) = tier.get("id").and_then(|v| v.as_str()) {
                    if !id.trim().is_empty() {
                        tier_id = id.trim().to_string();
                        break;
                    }
                }
            }
        }
    }

    // Call onboardUser with the extracted tier ID, polling until done
    let onboard_url = format!("{}/{}:onboardUser", API_ENDPOINT, API_VERSION);
    let onboard_body = serde_json::json!({
        "tierId": tier_id,
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI"
        }
    });

    for _attempt in 0..5 {
        let res = client.post(&onboard_url)
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .header("User-Agent", API_USER_AGENT)
            .header("X-Goog-Api-Client", API_CLIENT)
            .header("Client-Metadata", r#"{"ideType":"ANTIGRAVITY","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}"#)
            .json(&onboard_body)
            .send()
            .await
            .map_err(|e| format!("onboardUser request failed: {}", e))?;

        if res.status().is_success() {
            let json: Value = res.json().await.map_err(|e| format!("onboardUser parse error: {}", e))?;

            if json.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                if let Some(response) = json.get("response") {
                    if let Some(project) = response.get("cloudaicompanionProject") {
                        if let Some(s) = project.as_str() {
                            if !s.trim().is_empty() {
                                return Ok(s.trim().to_string());
                            }
                        }
                        if let Some(id) = project.get("id").and_then(|v| v.as_str()) {
                            if !id.trim().is_empty() {
                                return Ok(id.trim().to_string());
                            }
                        }
                    }
                }
            }
            // Not done yet, wait 2s and retry (using std sleep in blocking to avoid tokio dep)
            let sleep_future = async {
                let (tx, rx) = std::sync::mpsc::channel();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let _ = tx.send(());
                });
                let _ = tauri::async_runtime::spawn_blocking(move || { let _ = rx.recv(); }).await;
            };
            sleep_future.await;
        } else {
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("onboardUser error: {}", err_text));
        }
    }

    Err("Could not fetch project_id after 5 attempts".into())
}


#[derive(serde::Serialize)]
struct AntigravityModel {
    id: String,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    description: String,
    #[serde(rename = "inputTokenLimit")]
    input_token_limit: u32,
    #[serde(rename = "outputTokenLimit")]
    output_token_limit: u32,
    source: String,
}

#[tauri::command]
async fn fetch_gemini_models() -> Result<Vec<AntigravityModel>, String> {
    let models = vec![
        AntigravityModel {
            id: "antigravity-gemini-3.1-pro".into(),
            name: "antigravity-gemini-3.1-pro".into(),
            display_name: "Gemini 3.1 Pro".into(),
            description: "Gemini 3.1 Pro via Antigravity quota. Variants: -low, -high".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "antigravity-gemini-3.1-pro-high".into(),
            name: "antigravity-gemini-3.1-pro-high".into(),
            display_name: "Gemini 3.1 Pro (High)".into(),
            description: "Gemini 3.1 Pro with high thinking via Antigravity quota".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "antigravity-gemini-3.1-pro-low".into(),
            name: "antigravity-gemini-3.1-pro-low".into(),
            display_name: "Gemini 3.1 Pro (Low)".into(),
            description: "Gemini 3.1 Pro with low thinking via Antigravity quota".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "antigravity-gemini-3-flash".into(),
            name: "antigravity-gemini-3-flash".into(),
            display_name: "Gemini 3 Flash".into(),
            description: "Gemini 3 Flash via Antigravity quota. Variants: -minimal, -low, -medium, -high".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            source: "antigravity".into(),
        },
         AntigravityModel {
            id: "antigravity-claude-sonnet-4-6".into(),
            name: "antigravity-claude-sonnet-4-6".into(),
            display_name: "Claude Sonnet 4.6".into(),
            description: "Claude Sonnet 4.6 via Antigravity quota".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "antigravity-claude-opus-4-6-thinking".into(),
            name: "antigravity-claude-opus-4-6-thinking".into(),
            display_name: "Claude Opus 4.6 (Thinking)".into(),
            description: "Claude Opus 4.6 with extended thinking via Antigravity quota.".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "gemini-2.5-pro".into(),
            name: "gemini-2.5-pro".into(),
            display_name: "Gemini 2.5 Pro".into(),
            description: "Gemini 2.5 Pro via Gemini CLI quota".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            source: "gemini-cli".into(),
        },
    ];

    Ok(models)
}


#[tauri::command]
async fn execute_model_prompt(app: AppHandle, token: String, project_id: String, model: String, prompt: String) -> Result<(), String> {
    let mut thinking_level = "low";
    let base_model = if model.ends_with("-high") {
        thinking_level = "high";
        model.trim_end_matches("-high").to_string()
    } else if model.ends_with("-low") {
        thinking_level = "low";
        model.trim_end_matches("-low").to_string()
    } else if model.ends_with("-minimal") {
        thinking_level = "minimal";
        model.trim_end_matches("-minimal").to_string()
    } else if model.ends_with("-medium") {
        thinking_level = "medium";
        model.trim_end_matches("-medium").to_string()
    } else {
        model.clone()
    };

    // Generate stable sessionId from prompt hash (matching CLIProxyAPI)
    let session_id = format!("-{}", {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        prompt.hash(&mut hasher);
        hasher.finish() & 0x7FFFFFFFFFFFFFFF
    });

    let payload = serde_json::json!({
        "project": project_id,
        "model": base_model,
        "request": {
            "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
            "generationConfig": {
                "thinkingConfig": {
                    "thinkingLevel": thinking_level
                }
            },
            "sessionId": session_id
        },
        "requestType": "agent",
        "userAgent": "antigravity",
        "requestId": format!("agent-{}", uuid::Uuid::new_v4())
    });

    let client = reqwest::Client::new();
    let res = client.post(format!("{}/{}:streamGenerateContent?alt=sse", API_DAILY_ENDPOINT, API_VERSION))
        .bearer_auth(&token)
        .header("User-Agent", STREAM_USER_AGENT)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Google API Error: {}", err_text));
    }

    let mut stream = res.bytes_stream().eventsource();
    
    while let Some(event) = stream.next().await {
        match event {
            Ok(event) => {
                let text = event.data;
                if let Ok(json) = serde_json::from_str::<Value>(&text) {
                    if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
                        if let Some(first) = candidates.get(0) {
                            if let Some(content) = first.get("content") {
                                if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                                    for part in parts {
                                        if let Some(text_chunk) = part.get("text").and_then(|t| t.as_str()) {
                                            let _ = app.emit("ai_chunk", text_chunk);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("ai_error", e.to_string());
                break;
            }
        }
    }
    
    let _ = app.emit("ai_complete", ());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![login_oauth_proxy, fetch_gemini_models, execute_model_prompt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
