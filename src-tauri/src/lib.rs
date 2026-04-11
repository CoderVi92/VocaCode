use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
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
const HEADER_UA_ANTIGRAVITY: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.18.3 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36";
const HEADER_X_GOOG_API_CLIENT: &str = "google-cloud-sdk vscode_cloudshelleditor/0.1";

fn client_metadata() -> String {
    r#"{"ideType":"ANTIGRAVITY","platform":"WINDOWS","pluginType":"GEMINI"}"#.to_string()
}

// ── Sistem Trace Logger ──
#[tauri::command]
fn write_debug_log(module: String, action: String, message: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use chrono::Local;

    let desktop_path = "C:\\Users\\Administrator\\Desktop\\vocacode-debug.log";
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let log_line = format!("[{}] [{}] [{}]\n{}\n----------------------------------------------------\n", now, module, action, message);

    // Silently continue if failed
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(desktop_path) {
        let _ = file.write_all(log_line.as_bytes());
    }
    Ok(())
}

// ── Login Response ──
#[derive(Serialize)]
struct LoginResult {
    access_token: String,
    refresh_token: String,
    project_id: String,
}

#[tauri::command]
async fn login_oauth_proxy(app: tauri::AppHandle, code_challenge: String, code_verifier: String, oauth_state: String) -> Result<String, String> {
    let server = Server::http(format!("127.0.0.1:{}", CALLBACK_PORT)).map_err(|e| e.to_string())?;

    // PKCE S256 — code_challenge dihasilkan oleh frontend (auth-basic.ts generateCodeChallenge)
    // Serta State Encoding CSRF
    // Mengikuti pola server.cjs buildAuthUrl() baris 213-230
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&client_id={}&prompt=consent&redirect_uri=http://localhost:{}/oauth2callback&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        CLIENT_ID,
        CALLBACK_PORT,
        OAUTH_SCOPES.replace(' ', "%20"),
        code_challenge,
        oauth_state
    );

    app.opener().open_url(&auth_url, None::<&str>).map_err(|e| e.to_string())?;

    let (auth_code, returned_state) = tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        loop {
            if start.elapsed().as_secs() > 120 {
                return Err("Timeout login OAuth: Pengguna tidak menyelesaikan login dalam 2 menit.".to_string());
            }
            if let Ok(Some(request)) = server.try_recv() {
                let url = request.url();
                if url.starts_with("/oauth2callback") {
                    let mut code_val = String::new();
                    let mut state_val = String::new();
                    if let Some(query) = url.split('?').nth(1) {
                        for param in query.split('&') {
                            if param.starts_with("code=") {
                                let raw_code = param.trim_start_matches("code=");
                                code_val = raw_code.replace("%2F", "/").replace("%2f", "/")
                                                   .replace("%3D", "=").replace("%3d", "=")
                                                   .replace("%2B", "+").replace("%2b", "+");
                            }
                            if param.starts_with("state=") {
                                state_val = param.trim_start_matches("state=").to_string();
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
                    
                    return Ok((code_val, state_val));
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

    if returned_state != oauth_state {
        return Err("State CSRF validation failed! Data mungkin telah disadap (State Encoding Error)".into());
    }


    // ── Step 1: Exchange code for tokens ──
    // PKCE: Sertakan code_verifier pada token exchange (server.cjs exchangeToken baris 256-263)
    #[derive(Serialize)]
    struct TokenRequest {
        client_id: String,
        client_secret: String,
        code: String,
        grant_type: String,
        redirect_uri: String,
        code_verifier: String,
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
            code_verifier: code_verifier,
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        let _ = write_debug_log("Kelompok 1 - OAuth".into(), "TokenExchange".into(), format!("Error HTTP: {}", err_text));
        return Err(format!("Token Exchange Error: {}", err_text));
    }

    let token_data: TokenResponse = res.json().await.map_err(|e| {
        let _ = write_debug_log("Kelompok 1 - OAuth".into(), "TokenExchange".into(), format!("JSON Parse Error: {}", e));
        e.to_string()
    })?;
    let _ = write_debug_log("Kelompok 1 - OAuth".into(), "TokenExchange".into(), "Sukses menukar token otorisasi".into());

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

    // Body kosong — metadata dikirim via header Client-Metadata
    // (server.cjs: "API menolak string enum di body JSON")
    let body = serde_json::json!({});

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


// ── Token Refresh (mengikuti pola server.cjs refreshAccessTokenSafe) ──
#[tauri::command]
async fn refresh_access_token(refresh_token: String) -> Result<String, String> {
    let client = Client::new();

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token as &str),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
        ])
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        let _ = write_debug_log("Kelompok 1 - OAuth".into(), "RefreshToken".into(), format!("Error HTTP: {}", err_text));
        return Err(format!("Token refresh error: {}", err_text));
    }

    // Return raw JSON dari Google (berisi access_token, expires_in, dll.)
    let body = res.text().await.map_err(|e| {
        let _ = write_debug_log("Kelompok 1 - OAuth".into(), "RefreshToken".into(), format!("Read body error: {}", e));
        format!("Read body error: {}", e)
    })?;
    
    let _ = write_debug_log("Kelompok 1 - OAuth".into(), "RefreshToken".into(), "Berhasil refresh token".into());
    Ok(body)
}


// ── Model List ──
// Refactored v2: Sinkronisasi 1:1 dengan server.cjs MODELS array (baris 63-112)
// - 6 model terpisah, masing-masing dengan ID unik yang valid di API
// - thinkingOptions menggantikan tiers (dropdown "Tingkat Berpikir")
// - apiProvider menentukan endpoint routing

#[derive(serde::Serialize, Clone)]
struct ThinkingOption {
    label: String,
    budget: i32,  // -1 = dynamic/auto (untuk Gemini Flash)
}

#[derive(serde::Serialize, Clone)]
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
    #[serde(rename = "supportsImages")]
    supports_images: bool,
    #[serde(rename = "supportsVideo")]
    supports_video: bool,
    #[serde(rename = "supportedMimeTypes")]
    supported_mime_types: Vec<String>,
    #[serde(rename = "quotaPercent", skip_serializing_if = "Option::is_none")]
    quota_percent: Option<u8>,
    #[serde(rename = "apiProvider")]
    api_provider: String,
    #[serde(rename = "supportsThinking")]
    supports_thinking: bool,
    #[serde(rename = "thinkingOptions")]
    thinking_options: Vec<ThinkingOption>,
}

/// Menentukan endpoint method berdasarkan apiProvider (server.cjs baris 480-481)
fn get_api_method(api_provider: &str) -> &'static str {
    if api_provider == "API_PROVIDER_OPENAI_VERTEX" {
        "streamGenerateContent"
    } else {
        "generateContent"
    }
}

/// Struktur untuk mengirim usage metadata ke frontend
#[derive(serde::Serialize, Clone)]
struct UsagePayload {
    prompt_tokens: u64,
    output_tokens: u64,
    thoughts_tokens: u64,
    total_tokens: u64,
}

/// Struktur untuk mengirim error terstruktur ke frontend (matching server.cjs getSolution)
#[derive(serde::Serialize, Clone)]
struct ErrorPayload {
    status: u16,
    title: String,
    message: String,
    verification_url: Option<String>,
}

/// Parse verification URL dari error.details[].links[] (server.cjs getSolution baris 632-641)
fn extract_verification_url(json: &Value) -> Option<String> {
    let details = json.pointer("/error/details")
        .or_else(|| json.pointer("/response/error/details"))
        .and_then(|d| d.as_array())?;
    for detail in details {
        if let Some(links) = detail.get("links").and_then(|l| l.as_array()) {
            for link in links {
                let desc = link.get("description").and_then(|d| d.as_str()).unwrap_or("");
                if desc.contains("Verify") || desc.contains("verify") {
                    if let Some(url) = link.get("url").and_then(|u| u.as_str()) {
                        return Some(url.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Extract usageMetadata dari response (server.cjs baris 570)
fn extract_usage(data: &Value) -> Option<UsagePayload> {
    let usage = data.pointer("/response/usageMetadata")
        .or_else(|| data.get("usageMetadata"))?;
    Some(UsagePayload {
        prompt_tokens: usage.get("promptTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
        output_tokens: usage.get("candidatesTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
        thoughts_tokens: usage.get("thoughtsTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
        total_tokens: usage.get("totalTokenCount").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

#[tauri::command]
async fn fetch_gemini_models_with_quota(access_token: String, project_id: String) -> Result<Vec<AntigravityModel>, String> {
    // 6 model terpisah — 1:1 match dengan server.cjs MODELS[] (baris 63-112)
    let gemini_full_mimes: Vec<String> = vec!["image/heic","application/x-python-code","text/x-typescript","video/webm","application/rtf","image/png","text/xml","text/javascript","video/jpeg2000","video/mp4","text/markdown","application/x-javascript","video/text/timestamp","audio/webm;codecs=opus","video/audio/wav","text/csv","image/heif","image/jpeg","text/html","text/css","text/plain","application/x-ipynb+json","application/x-typescript","application/pdf","video/videoframe/jpeg2000","image/webp","video/audio/s16le","text/rtf","text/x-python","application/json","text/x-python-script"].iter().map(|s| s.to_string()).collect();
    let claude_mimes: Vec<String> = vec!["image/png","image/webp","video/jpeg2000","video/videoframe/jpeg2000","image/heic","image/heif","image/jpeg"].iter().map(|s| s.to_string()).collect();

    let mut models = vec![
        // 1. gemini-3.1-pro-high (server.cjs baris 64-71)
        //    thinkingBudget: 10001, minThinkingBudget: 128
        //    Opsi: Linear(128), Sistematis(5065), Kompleks(10001)
        AntigravityModel {
            id: "gemini-3.1-pro-high".into(),
            name: "gemini-3.1-pro-high".into(),
            display_name: "Gemini 3.1 Pro (High)".into(),
            description: "Google's most capable model with advanced thinking".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
            supports_images: true,
            supports_video: true,
            supported_mime_types: gemini_full_mimes.clone(),
            quota_percent: None,
            api_provider: "API_PROVIDER_GOOGLE_GEMINI".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (128 tokens)".into(), budget: 128 },
                ThinkingOption { label: "Sistematis (5065 tokens)".into(), budget: 5065 },
                ThinkingOption { label: "Kompleks (10001 tokens)".into(), budget: 10001 },
            ],
        },
        // 2. gemini-3.1-pro-low (server.cjs baris 72-79)
        //    thinkingBudget: 1001, minThinkingBudget: 128
        //    Opsi: Linear(128), Sistematis(565), Kompleks(1001)
        AntigravityModel {
            id: "gemini-3.1-pro-low".into(),
            name: "gemini-3.1-pro-low".into(),
            display_name: "Gemini 3.1 Pro (Low)".into(),
            description: "Balanced thinking with lower resource usage".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
            supports_images: true,
            supports_video: true,
            supported_mime_types: gemini_full_mimes.clone(),
            quota_percent: None,
            api_provider: "API_PROVIDER_GOOGLE_GEMINI".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (128 tokens)".into(), budget: 128 },
                ThinkingOption { label: "Sistematis (565 tokens)".into(), budget: 565 },
                ThinkingOption { label: "Kompleks (1001 tokens)".into(), budget: 1001 },
            ],
        },
        // 3. gemini-3-flash-agent (server.cjs baris 80-87)
        //    thinkingBudget: -1 (dynamic), minThinkingBudget: 32
        //    Opsi: Linear(-1/default), Kompleks(-1/default)
        AntigravityModel {
            id: "gemini-3-flash-agent".into(),
            name: "gemini-3-flash-agent".into(),
            display_name: "Gemini 3 Flash".into(),
            description: "Fast and versatile model for everyday tasks".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            source: "antigravity".into(),
            supports_images: true,
            supports_video: true,
            supported_mime_types: gemini_full_mimes.clone(),
            quota_percent: None,
            api_provider: "API_PROVIDER_GOOGLE_GEMINI".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (otomatis)".into(), budget: -1 },
                ThinkingOption { label: "Kompleks (otomatis)".into(), budget: -1 },
            ],
        },
        // 4. claude-sonnet-4-6 (server.cjs baris 88-95)
        //    thinkingBudget: 1024, minThinkingBudget: 1024
        //    Opsi: Linear(1024), Kompleks(1024) — keduanya di-clamp ke min
        AntigravityModel {
            id: "claude-sonnet-4-6".into(),
            name: "claude-sonnet-4-6".into(),
            display_name: "Claude Sonnet 4.6 (Thinking)".into(),
            description: "Anthropic's balanced model with extended thinking".into(),
            input_token_limit: 250_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
            supports_images: true,
            supports_video: false,
            supported_mime_types: claude_mimes.clone(),
            quota_percent: None,
            api_provider: "API_PROVIDER_ANTHROPIC_VERTEX".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (1024 tokens)".into(), budget: 1024 },
                ThinkingOption { label: "Kompleks (1024 tokens)".into(), budget: 1024 },
            ],
        },
        // 5. claude-opus-4-6-thinking (server.cjs baris 96-103)
        //    thinkingBudget: 1024, minThinkingBudget: 1024
        AntigravityModel {
            id: "claude-opus-4-6-thinking".into(),
            name: "claude-opus-4-6-thinking".into(),
            display_name: "Claude Opus 4.6 (Thinking)".into(),
            description: "Claude's most powerful reasoning model".into(),
            input_token_limit: 250_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
            supports_images: true,
            supports_video: false,
            supported_mime_types: claude_mimes.clone(),
            quota_percent: None,
            api_provider: "API_PROVIDER_ANTHROPIC_VERTEX".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (1024 tokens)".into(), budget: 1024 },
                ThinkingOption { label: "Kompleks (1024 tokens)".into(), budget: 1024 },
            ],
        },
        // 6. gpt-oss-120b-medium (server.cjs baris 104-111)
        //    thinkingBudget: 8192, minThinkingBudget: 1024
        //    PENTING: apiProvider = API_PROVIDER_OPENAI_VERTEX → streamGenerateContent
        AntigravityModel {
            id: "gpt-oss-120b-medium".into(),
            name: "gpt-oss-120b-medium".into(),
            display_name: "GPT-OSS 120B (Medium)".into(),
            description: "High-performance open weights model".into(),
            input_token_limit: 114_000,
            output_token_limit: 32_768,
            source: "antigravity".into(),
            supports_images: false,
            supports_video: false,
            supported_mime_types: vec![],
            quota_percent: None,
            api_provider: "API_PROVIDER_OPENAI_VERTEX".into(),
            supports_thinking: true,
            thinking_options: vec![
                ThinkingOption { label: "Linear (1024 tokens)".into(), budget: 1024 },
                ThinkingOption { label: "Kompleks (8192 tokens)".into(), budget: 8192 },
            ],
        },
    ];

    // Fetch quota dari API
    let client = Client::new();
    let url = format!("{}/{}:fetchAvailableModels", ENDPOINT_PROD, API_VERSION);
    let body = serde_json::json!({
        "project": project_id
    });

    let _ = write_debug_log("Kelompok 2 - fetchModels".into(), "Request".into(), format!("URL: {}\nPayload: {}", url, body));

    // Mengambil sisa kuota (Bypass panic, abaikan jika gagal, tetap return list kosong/awal)
    if let Ok(res) = client.post(&url)
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .header("User-Agent", HEADER_UA_ANTIGRAVITY)
        .json(&body)
        .send()
        .await
    {
        let status = res.status().as_u16();
        let err_text = res.text().await.unwrap_or_default();
        let _ = write_debug_log("Kelompok 2 - fetchModels".into(), "Response".into(), format!("HTTP {}\nRaw: {}", status, err_text));

        if status >= 200 && status < 300 {
            if let Ok(json) = serde_json::from_str::<Value>(&err_text) {
                // Parsing field models
                let models_obj = json.get("models").or_else(|| {
                    json.get("response").and_then(|r| r.get("models"))
                });

                if let Some(obj) = models_obj.and_then(|m| m.as_object()) {
                    for (key, val) in obj {
                        // Skip model yang tidak relevan (sesuai server.cjs filter)
                        if key.contains("gemini-2.5") || key.starts_with("tab_") || key.starts_with("chat_") {
                            continue;
                        }

                        let frac = val.get("quotaInfo")
                            .and_then(|qi| qi.get("remainingFraction"))
                            .and_then(|f| f.as_f64());

                        let percent = frac.map(|f| (f * 100.0).round() as u8).unwrap_or(0);

                        // Pass 1: Exact match (key == model.id)
                        let mut matched = false;
                        for model in models.iter_mut() {
                            if model.id == *key {
                                model.quota_percent = Some(percent);
                                matched = true;
                                break;
                            }
                        }

                        // Pass 2: Fallback loose partial match
                        if !matched {
                            for model in models.iter_mut() {
                                if model.quota_percent.is_none() && (model.id.contains(key.as_str()) || key.contains(model.id.as_str())) {
                                    model.quota_percent = Some(percent);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(models)
}


#[derive(serde::Deserialize, serde::Serialize)]
struct ChatMessage {
    role: String,
    text: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct FileAttachment {
    mime_type: String,
    data: String,
}

// ── Execute Model Prompt — Provider-aware routing (matching server.cjs chatWithModel) ──
// Refactored: Endpoint routing berdasarkan apiProvider
//   - API_PROVIDER_OPENAI_VERTEX  → streamGenerateContent
//   - API_PROVIDER_GOOGLE_GEMINI  → generateContent  
//   - API_PROVIDER_ANTHROPIC_VERTEX → generateContent
#[tauri::command]
async fn execute_model_prompt(
    app: AppHandle, 
    token: String, 
    project_id: String, 
    model: String, 
    prompt: String, 
    history: Vec<ChatMessage>, 
    thinking_budget: Option<i32>,
    attachments: Option<Vec<FileAttachment>>,
    api_provider: Option<String>,
    supports_thinking: Option<bool>,
    min_thinking_budget: Option<i32>
) -> Result<(), String> {
    let effective_project = if project_id.trim().is_empty() {
        DEFAULT_PROJECT_ID.to_string()
    } else {
        project_id
    };

    // Resolve apiProvider (dari frontend, atau default ke Gemini)
    let api_provider = api_provider.unwrap_or_else(|| "API_PROVIDER_GOOGLE_GEMINI".to_string());
    let model_supports_thinking = supports_thinking.unwrap_or(true);

    // Poin 5: Multi-Turn Chat (Konstruksi Array Contents)
    let mut contents = Vec::new();
    for msg in history {
        // Map "user" -> "user", "ai/assistant" -> "model" (Google specific)
        let role = if msg.role == "user" { "user" } else { "model" };
        contents.push(serde_json::json!({
            "role": role,
            "parts": [{ "text": msg.text }]
        }));
    }
    
    // Terakhir masukkan prompt saat ini beserta lampiran (Fitur 6)
    let mut current_parts = Vec::new();
    if let Some(files) = attachments {
        for file in files {
            current_parts.push(serde_json::json!({
                "inlineData": {
                    "mimeType": file.mime_type,
                    "data": file.data
                }
            }));
            let _ = write_debug_log("Kelompok 2 - Antigravity API".to_string(), "Attachments".to_string(), format!("Added file: {}", file.mime_type));
        }
    }
    current_parts.push(serde_json::json!({ "text": prompt }));

    contents.push(serde_json::json!({
        "role": "user",
        "parts": current_parts
    }));

    // server.cjs baris 486-496: Konstruksi request payload dengan thinkingConfig
    // PENTING: Mengikuti logika server.cjs baris 468-496 secara presisi:
    //  1. Cek supportsThinking (server.cjs baris 489)
    //  2. Jika budget = -1, tetap kirim thinkingConfig (Gemini Flash dynamic)
    //  3. Clamp budget ke minBudget jika di bawah minimum (server.cjs baris 474)
    let mut request_obj = serde_json::json!({
        "contents": contents
    });

    // Hanya tambahkan thinkingConfig jika model mendukung thinking (server.cjs baris 489)
    if model_supports_thinking {
        let mut t_budget = thinking_budget.unwrap_or(-1) as i64;
        let min_budget = min_thinking_budget.unwrap_or(128) as i64;

        // Safety clamp: jangan kirim budget di bawah min model (server.cjs baris 472-476)
        if t_budget != -1 && t_budget < min_budget {
            t_budget = min_budget;
            let _ = write_debug_log("Kelompok 2 - Antigravity API".into(), "BudgetClamp".into(),
                format!("Budget di-clamp ke minimum: {}", min_budget));
        }

        if t_budget == -1 {
            // budget -1 = dynamic (Gemini Flash): kirim tanpa thinkingBudget field  
            // agar API yang memutuskan sendiri
            request_obj.as_object_mut().unwrap().insert(
                "generationConfig".to_string(),
                serde_json::json!({
                    "thinkingConfig": {
                        "includeThoughts": true
                    }
                })
            );
        } else {
            request_obj.as_object_mut().unwrap().insert(
                "generationConfig".to_string(),
                serde_json::json!({
                    "thinkingConfig": {
                        "includeThoughts": true,
                        "thinkingBudget": t_budget
                    }
                })
            );
        }
    }

    let payload = serde_json::json!({
        "project": effective_project,
        "model": model,
        "request": request_obj
    });

    let _ = write_debug_log(
        "Kelompok 2 - Antigravity API".to_string(),
        "PayloadInfo".to_string(),
        format!("Model: {} | Provider: {} | Method: {} | ThinkingBudget: {:?}", model, api_provider, get_api_method(&api_provider), thinking_budget)
    );

    // Tentukan API method berdasarkan provider (server.cjs baris 480-482)
    // OpenAI Vertex → streamGenerateContent, lainnya → generateContent
    let api_method = get_api_method(&api_provider);
    let is_stream = api_provider == "API_PROVIDER_OPENAI_VERTEX";

    // Endpoint fallback: daily → autopush → prod (matching server.cjs CHAT_ENDPOINTS)
    let chat_endpoints = [ENDPOINT_DAILY, ENDPOINT_AUTOPUSH, ENDPOINT_PROD];
    let client = reqwest::Client::new();

    // Retry logic (matching server.cjs chatWithModelRetry, baris 465-480)
    let max_retries: u32 = 3;

    for attempt in 1..=max_retries {
        let mut last_err = String::from("Semua endpoint gagal.");
        let mut should_retry = false;
        let mut retry_status: u16 = 0;
        let mut success = false;
        let mut response_data: Option<Value> = None;
        let mut aggregated_text = String::new();
        let mut aggregated_thoughts = String::new();

        for endpoint in &chat_endpoints {
            // URL: /v1internal:{method} — method ditentukan oleh provider (server.cjs baris 482)
            let url = format!("{}/{}:{}", endpoint, API_VERSION, api_method);

            let _ = write_debug_log(
                "Kelompok 2 - Antigravity API".to_string(),
                format!("ChatRequest - {} ({})", model, endpoint),
                format!("Method: {} | Provider: {} | isStream: {}", api_method, api_provider, is_stream)
            );

            let res = match client.post(&url)
                .bearer_auth(&token)
                .header("Content-Type", "application/json")
                .header("User-Agent", HEADER_UA_ANTIGRAVITY)
                .header("X-Goog-Api-Client", HEADER_X_GOOG_API_CLIENT)
                .header("Client-Metadata", client_metadata())
                .json(&payload)
                .send()
                .await {
                    Ok(r) => r,
                    Err(e) => {
                        last_err = format!("Gagal menghubungi server: {}", e);
                        continue;
                    }
                };

            let status = res.status().as_u16();
            let err_text = res.text().await.unwrap_or_default();
            
            let _ = write_debug_log(
                "Kelompok 2 - Antigravity API".to_string(), 
                format!("ChatResponse - {} ({})", model, endpoint), 
                format!("HTTP Status: {}\nRaw Body:\n{}", status, &err_text[..err_text.len().min(2000)])
            );
            
            if status >= 200 && status < 300 {
                if let Ok(data) = serde_json::from_str::<Value>(&err_text) {
                    // server.cjs baris 524-548: Handle stream vs non-stream response
                    if is_stream {
                        // streamGenerateContent mengembalikan JSON Array of chunks
                        // Gabungkan teks dari SEMUA chunks, pisahkan thoughts vs text
                        if let Some(arr) = data.as_array() {
                            for chunk in arr {
                                let candidates = chunk.get("response")
                                    .and_then(|r| r.get("candidates"))
                                    .or_else(|| chunk.get("candidates"));
                                if let Some(cands) = candidates.and_then(|c| c.as_array()) {
                                    if let Some(first) = cands.first() {
                                        if let Some(parts) = first.pointer("/content/parts").and_then(|p| p.as_array()) {
                                            for part in parts {
                                                let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                                                if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                                                    if is_thought {
                                                        aggregated_thoughts.push_str(t);
                                                    } else {
                                                        aggregated_text.push_str(t);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // Ambil chunk terakhir sebagai data utama (untuk usage metadata)
                            response_data = arr.last().cloned().map(Some).unwrap_or(Some(data));
                        } else {
                            // Bukan array, treat sebagai single response
                            response_data = Some(data);
                        }
                    } else {
                        // Non-stream: response langsung
                        response_data = Some(data);
                    }
                    success = true;
                    break;
                } else {
                    last_err = "Gagal parsing respons JSON yang valid".to_string();
                    continue;
                }
            }

            // Jika GAGAL pada endpoint ini:
            last_err = match status {
                401 => "Token autentikasi sudah kedaluwarsa. Silakan login ulang.".to_string(),
                403 => "Akses ditolak. Silakan login ulang atau periksa izin akun Anda.".to_string(),
                429 => format!("Batas permintaan tercapai untuk model {}. Menunggu sebelum mencoba lagi...", model),
                503 => {
                    if err_text.contains("MODEL_CAPACITY_EXHAUSTED") || err_text.contains("No capacity available") {
                        format!("Model {} sedang penuh (kapasitas habis). Mencoba ulang...", model)
                    } else {
                        format!("Server sedang sibuk. Mencoba ulang...")
                    }
                },
                _ => {
                    if err_text.contains("RESOURCE_EXHAUSTED") || err_text.contains("quota") {
                        format!("Kuota untuk model {} sudah habis. Coba gunakan model lain.", model)
                    } else {
                        format!("Error API ({}): {}", status, if err_text.len() > 200 { &err_text[..200] } else { &err_text })
                    }
                }
            };

            // 429 dan 503 memicu delay dan percobaan berulang pada loop utama (mirip server.cjs baris 471)
            // Error HTTP lain seperti 403 atau 404 maka kita lanjut iterasi endpoint berikutnya
            if status == 429 || status == 503 {
                if attempt < max_retries {
                    should_retry = true;
                    retry_status = status;
                }
                break; // Hentikan fallback endpoint, persiapkan retry backoff timer 
            }
        } // akhir dari loop fallback endpoint

        // Jika salah satu endpoint pada loop di atas berhasil:
        if success {
            if let Some(data) = response_data {
                // Check API-level error JSON (bisa di level root atau nested di response)
                // Matching server.cjs: cek juga error di level array (stream response)
                let error_json = data.get("error")
                    .or_else(|| data.pointer("/response/error"));
                if let Some(err) = error_json {
                    let err_code = err.get("code").and_then(|c| c.as_u64()).unwrap_or(0);
                    let err_status = err.get("status").and_then(|s| s.as_str()).unwrap_or("");
                    let raw_msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("Error tidak diketahui dari API");

                    // Parse verification URL (server.cjs getSolution baris 632-641)
                    let verification_url = extract_verification_url(&data);

                    // Matching server.cjs getSolution untuk pesan ramah
                    let (title, friendly_msg) = if err_code == 403 {
                        if raw_msg.contains("Verify") || raw_msg.contains("verification") || raw_msg.contains("restricted") || verification_url.is_some() {
                            ("⚠️ Akun Butuh Verifikasi Nomor HP".to_string(),
                             "Google menolak karena mendeteksi aktivitas mencurigakan atau butuh verifikasi nomor HP.".to_string())
                        } else {
                            ("📉 Layanan Belum Aktif / Ditolak".to_string(),
                             format!("Model / layanan AI ini belum diaktifkan untuk akun Anda. Coba ganti model AI lain."))
                        }
                    } else if err_status == "RESOURCE_EXHAUSTED" || raw_msg.contains("quota") {
                        // Extract waktu reset jika ada (server.cjs baris 668)
                        let reset_info = if let Some(caps) = raw_msg.find("reset after") {
                            format!(" Jeda tunggu: {}", &raw_msg[caps..])
                        } else { String::new() };
                        ("🛑 Kuota Model Sudah Habis".to_string(),
                         format!("Kuota untuk model {} sudah habis.{} Coba gunakan model lain.", model, reset_info))
                    } else if err_code == 503 || raw_msg.contains("No capacity") {
                        ("⏳ Model Sedang Penuh".to_string(),
                         format!("Model {} sedang penuh (kapasitas habis). Coba beberapa saat lagi atau gunakan model lain.", model))
                    } else if err_code == 429 {
                        ("⏳ Terlalu Cepat".to_string(),
                         "Anda mengirim pesan terlalu cepat. Tunggu sebentar lalu coba lagi.".to_string())
                    } else if err_code == 404 || err_status == "NOT_FOUND" {
                        ("❓ Model Tidak Ditemukan".to_string(),
                         format!("Model '{}' tidak ditemukan. Pastikan model tersedia untuk akun Anda.", model))
                    } else if err_code == 500 {
                        ("💥 Error Internal Server (500)".to_string(),
                         "Server Google mengalami crash internal. Coba turunkan Tingkat Berpikir ke level yang lebih rendah.".to_string())
                    } else if err_code == 400 && raw_msg.contains("Project") {
                        ("📁 Masalah Project ID".to_string(),
                         "Project ID tidak valid. Silakan login ulang.".to_string())
                    } else {
                        ("Error AI".to_string(), format!("Error AI: {}", raw_msg))
                    };

                    // Emit structured error (bukan string biasa)
                    let error_payload = ErrorPayload {
                        status: err_code as u16,
                        title,
                        message: friendly_msg.clone(),
                        verification_url,
                    };
                    let _ = app.emit("ai_error_detail", &error_payload);
                    let _ = app.emit("ai_error", &friendly_msg);
                    return Err(friendly_msg);
                }

                // Gabungkan teks dari stream (jika sudah di-aggregate sebelumnya)
                let mut text = aggregated_text.clone();

                // Untuk non-stream atau jika aggregated kosong: extract dari response langsung
                // Matching server.cjs baris 553-565
                if text.is_empty() {
                    let candidates = data.get("candidates")
                        .or_else(|| data.pointer("/response/candidates"));
                    if let Some(cands) = candidates.and_then(|c| c.as_array()) {
                        if let Some(first) = cands.first() {
                            if let Some(parts) = first.pointer("/content/parts").and_then(|p| p.as_array()) {
                                for part in parts {
                                    let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                                    if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                                        if is_thought {
                                            aggregated_thoughts.push_str(t);
                                        } else if !t.is_empty() {
                                            text.push_str(t);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if text.is_empty() {
                    text = "(Respon kosong — model tidak mengembalikan teks)".to_string();
                }

                // Emit thoughts SEBELUM text (server.cjs menampilkan thoughts panel di atas response)
                if !aggregated_thoughts.is_empty() {
                    let _ = app.emit("ai_thoughts", aggregated_thoughts.as_str());
                }

                // Emit usage metadata (server.cjs baris 570: data.response?.usageMetadata || data.usageMetadata)
                if let Some(usage) = extract_usage(&data) {
                    let _ = app.emit("ai_usage", &usage);
                }

                let _ = app.emit("ai_chunk", text.as_str());
                let _ = app.emit("ai_complete", ());
                return Ok(());
            }
        }

        // Retry backoff (matching server.cjs: waitSec = attempt * 3)
        if should_retry {
            let wait_secs = attempt as u64 * 3;
            let retry_msg = format!("⏳ Percobaan {}/{} — menunggu {}s (error {})...", attempt, max_retries, wait_secs, retry_status);
            let _ = app.emit("ai_retry", retry_msg.as_str());

            // Async sleep
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(wait_secs));
                let _ = tx.send(());
            });
            let _ = tauri::async_runtime::spawn_blocking(move || { let _ = rx.recv(); }).await;
            continue;
        }

        // Jika tidak ada retry, emit error terakhir
        let _ = app.emit("ai_error", &last_err);
        return Err(last_err);
    }

    // Max retry tercapai
    let final_err = format!("Model {} gagal merespons setelah {} percobaan. Coba gunakan model lain.", model, max_retries);
    let _ = app.emit("ai_error", &final_err);
    Err(final_err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            login_oauth_proxy,
            fetch_gemini_models_with_quota,
            execute_model_prompt,
            refresh_access_token,
            write_debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
