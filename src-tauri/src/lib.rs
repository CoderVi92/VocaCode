use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use eventsource_stream::Eventsource;
use serde_json::Value;

// ── OAuth Constants ──
const CLIENT_ID: &str = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";
const CALLBACK_PORT: u16 = 51121;
const OAUTH_SCOPES: &str = "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs";

// ── API Endpoints (matching opencode-ag-auth/constants.ts) ──
const ENDPOINT_DAILY: &str = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const ENDPOINT_AUTOPUSH: &str = "https://autopush-cloudcode-pa.sandbox.googleapis.com";
const ENDPOINT_PROD: &str = "https://cloudcode-pa.googleapis.com";
const API_VERSION: &str = "v1internal";

// ── Default fallback project (from opencode-ag-auth) ──
const DEFAULT_PROJECT_ID: &str = "rising-fact-p41fc";

// ── Headers ──
const HEADER_UA_GEMINI_CLI: &str = "google-api-nodejs-client/9.15.1";
const HEADER_UA_ANTIGRAVITY: &str = "antigravity/1.18.3 windows/amd64";
const HEADER_X_GOOG_API_CLIENT: &str = "google-cloud-sdk vscode_cloudshelleditor/0.1";

fn client_metadata() -> String {
    r#"{"ideType":"ANTIGRAVITY","platform":"WINDOWS","pluginType":"GEMINI"}"#.to_string()
}

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

    // ── Step 2: Fetch project_id via loadCodeAssist (prod first, then fallback) ──
    let project_id = fetch_project_id_internal(&client, &token_data.access_token).await
        .unwrap_or_else(|_| DEFAULT_PROJECT_ID.to_string());

    // ── Return JSON with all auth data ──
    let result = LoginResult {
        access_token: token_data.access_token,
        refresh_token: token_data.refresh_token,
        project_id,
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

/// Fetch the user's cloudaicompanionProject via loadCodeAssist endpoint.
/// Tries prod first, then daily, then autopush (matching opencode-ag-auth ANTIGRAVITY_LOAD_ENDPOINTS).
/// Falls back to onboardUser if no project found.
async fn fetch_project_id_internal(client: &Client, access_token: &str) -> Result<String, String> {
    // Try loadCodeAssist across all endpoints (prod first)
    let load_endpoints = [ENDPOINT_PROD, ENDPOINT_DAILY, ENDPOINT_AUTOPUSH];

    let body = serde_json::json!({
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "WINDOWS",
            "pluginType": "GEMINI"
        }
    });

    let mut last_response_json: Option<Value> = None;

    for endpoint in &load_endpoints {
        let load_url = format!("{}/{}:loadCodeAssist", endpoint, API_VERSION);

        let res = match client.post(&load_url)
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .header("User-Agent", HEADER_UA_GEMINI_CLI)
            .header("X-Goog-Api-Client", HEADER_X_GOOG_API_CLIENT)
            .header("Client-Metadata", client_metadata())
            .json(&body)
            .send()
            .await {
                Ok(r) => r,
                Err(_) => continue,
            };

        if !res.status().is_success() {
            continue;
        }

        let json: Value = match res.json().await {
            Ok(j) => j,
            Err(_) => continue,
        };

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

        last_response_json = Some(json);
        break; // got a successful response but no project — proceed to onboard
    }

    // No project found — user needs onboarding
    // Extract default tier ID from allowedTiers (matching opencode-ag-auth project.ts:getDefaultTierId)
    let mut tier_id = "FREE".to_string();
    if let Some(ref json) = last_response_json {
        if let Some(tiers) = json.get("allowedTiers").and_then(|t| t.as_array()) {
            // First try to find default tier
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
            // Fallback: use first tier if no default found
            if tier_id == "FREE" {
                if let Some(first) = tiers.first() {
                    if let Some(id) = first.get("id").and_then(|v| v.as_str()) {
                        if !id.trim().is_empty() {
                            tier_id = id.trim().to_string();
                        }
                    }
                }
            }
        }
    }

    // Call onboardUser — try across fallback endpoints (matching opencode-ag-auth project.ts:onboardManagedProject)
    let onboard_body = serde_json::json!({
        "tierId": tier_id,
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "WINDOWS",
            "pluginType": "GEMINI"
        }
    });

    let fallback_endpoints = [ENDPOINT_DAILY, ENDPOINT_AUTOPUSH, ENDPOINT_PROD];

    for endpoint in &fallback_endpoints {
        let onboard_url = format!("{}/{}:onboardUser", endpoint, API_VERSION);

        for _attempt in 0..10 {
            let res = match client.post(&onboard_url)
                .bearer_auth(access_token)
                .header("Content-Type", "application/json")
                .header("User-Agent", HEADER_UA_ANTIGRAVITY)
                .header("X-Goog-Api-Client", HEADER_X_GOOG_API_CLIENT)
                .header("Client-Metadata", client_metadata())
                .json(&onboard_body)
                .send()
                .await {
                    Ok(r) => r,
                    Err(_) => break,
                };

            if !res.status().is_success() {
                break;
            }

            let json: Value = match res.json().await {
                Ok(j) => j,
                Err(_) => break,
            };

            if json.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                if let Some(managed_id) = json.pointer("/response/cloudaicompanionProject/id")
                    .and_then(|v| v.as_str()) {
                    if !managed_id.trim().is_empty() {
                        return Ok(managed_id.trim().to_string());
                    }
                }
                // done but no project in response — use default
                return Ok(DEFAULT_PROJECT_ID.to_string());
            }

            // Not done yet — wait 5s and retry (matching opencode-ag-auth: delayMs=5000)
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                let _ = tx.send(());
            });
            let _ = tauri::async_runtime::spawn_blocking(move || { let _ = rx.recv(); }).await;
        }
    }

    // All attempts failed — return default project ID as final fallback
    Ok(DEFAULT_PROJECT_ID.to_string())
}


// ── Token Refresh ──
#[tauri::command]
async fn refresh_access_token(refresh_token: String) -> Result<String, String> {
    let client = Client::new();

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
        ])
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token refresh error: {}", err_text));
    }

    let json: Value = res.json().await.map_err(|e| format!("Parse error: {}", e))?;
    let new_token = json.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in refresh response")?;

    Ok(new_token.to_string())
}


// ── Model List ──
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
    // Model IDs match verified working models from opencode-ag-auth model-resolver.ts
    let models = vec![
        AntigravityModel {
            id: "gemini-3.1-pro-high".into(),
            name: "gemini-3.1-pro-high".into(),
            display_name: "Gemini 3.1 Pro (High)".into(),
            description: "Gemini 3.1 Pro with high thinking budget".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "gemini-3.1-pro-low".into(),
            name: "gemini-3.1-pro-low".into(),
            display_name: "Gemini 3.1 Pro (Low)".into(),
            description: "Gemini 3.1 Pro with low thinking budget".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "gemini-3-flash".into(),
            name: "gemini-3-flash".into(),
            display_name: "Gemini 3 Flash".into(),
            description: "Gemini 3 Flash — fast and lightweight".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "claude-sonnet-4-6".into(),
            name: "claude-sonnet-4-6".into(),
            display_name: "Claude Sonnet 4.6".into(),
            description: "Claude Sonnet 4.6 via Antigravity".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
        },
        AntigravityModel {
            id: "claude-opus-4-6-thinking".into(),
            name: "claude-opus-4-6-thinking".into(),
            display_name: "Claude Opus 4.6 (Thinking)".into(),
            description: "Claude Opus 4.6 with extended thinking".into(),
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


// ── Execute Model Prompt with Endpoint Fallback ──
#[tauri::command]
async fn execute_model_prompt(app: AppHandle, token: String, project_id: String, model: String, prompt: String) -> Result<(), String> {
    // Use project_id or fallback to default
    let effective_project = if project_id.trim().is_empty() {
        DEFAULT_PROJECT_ID.to_string()
    } else {
        project_id
    };

    // Build thinking config based on model family
    // Gemini 3.x uses thinkingLevel (string), Claude/Gemini 2.5 uses thinkingBudget (numeric)
    let thinking_config = if model.contains("claude") {
        // Claude models: use thinkingBudget (numeric)
        serde_json::json!({
            "thinkingBudget": 16384,
            "includeThoughts": true
        })
    } else if model.starts_with("gemini-2.5") {
        // Gemini 2.5: use thinkingBudget (numeric)
        serde_json::json!({
            "thinkingBudget": 8192,
            "includeThoughts": true
        })
    } else {
        // Gemini 3.x: thinkingLevel is embedded in model name (e.g. gemini-3.1-pro-high)
        // No separate thinkingConfig needed — the API infers from model suffix
        serde_json::json!({})
    };

    // Build generation config
    let generation_config = if thinking_config.as_object().map_or(true, |o| o.is_empty()) {
        serde_json::json!({
            "maxOutputTokens": 65535
        })
    } else {
        serde_json::json!({
            "maxOutputTokens": 65535,
            "thinkingConfig": thinking_config
        })
    };

    // Generate stable sessionId
    let session_id = format!("-{}", {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        prompt.hash(&mut hasher);
        hasher.finish() & 0x7FFFFFFFFFFFFFFF
    });

    let payload = serde_json::json!({
        "project": effective_project,
        "model": model,
        "request": {
            "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
            "generationConfig": generation_config,
            "sessionId": session_id
        },
        "requestType": "agent",
        "userAgent": "antigravity",
        "requestId": format!("agent-{}", uuid::Uuid::new_v4())
    });

    // Try endpoints in fallback order: daily → prod (matching opencode-ag-auth ENDPOINT_FALLBACKS)
    let stream_endpoints = [ENDPOINT_DAILY, ENDPOINT_PROD];
    let client = reqwest::Client::new();

    let mut last_err = String::from("All endpoints failed");

    for endpoint in &stream_endpoints {
        let url = format!("{}/{}:streamGenerateContent?alt=sse", endpoint, API_VERSION);

        let res = match client.post(&url)
            .bearer_auth(&token)
            .header("User-Agent", HEADER_UA_ANTIGRAVITY)
            .header("Content-Type", "application/json")
            .header("X-Goog-Api-Client", HEADER_X_GOOG_API_CLIENT)
            .header("Client-Metadata", client_metadata())
            .json(&payload)
            .send()
            .await {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("Request to {} failed: {}", endpoint, e);
                    continue;
                }
            };

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let err_text = res.text().await.unwrap_or_default();
            last_err = format!("API Error ({}): {}", status, err_text);
            // 404 means wrong endpoint, try next
            if status == 404 {
                continue;
            }
            // Other errors (401, 403, 429, 500) — stop trying
            let _ = app.emit("ai_error", &last_err);
            return Err(last_err);
        }

        // Success — stream the response
        let mut stream = res.bytes_stream().eventsource();
        
        while let Some(event) = stream.next().await {
            match event {
                Ok(event) => {
                    let text = event.data;
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
                            if let Some(first) = candidates.first() {
                                if let Some(parts) = first.pointer("/content/parts").and_then(|p| p.as_array()) {
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
                Err(e) => {
                    let _ = app.emit("ai_error", e.to_string());
                    break;
                }
            }
        }
        
        let _ = app.emit("ai_complete", ());
        return Ok(());
    }

    // All endpoints failed
    let _ = app.emit("ai_error", &last_err);
    Err(last_err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            login_oauth_proxy,
            fetch_gemini_models,
            execute_model_prompt,
            refresh_access_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
