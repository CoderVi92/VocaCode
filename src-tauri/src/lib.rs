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
        return Err(format!("Token refresh error: {}", err_text));
    }

    // Return raw JSON dari Google (berisi access_token, expires_in, dll.)
    let body = res.text().await.map_err(|e| format!("Read body error: {}", e))?;
    Ok(body)
}


// ── Model List ──
#[derive(serde::Serialize)]
struct AiModelTier {
    id: String,
    name: String,
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
    #[serde(rename = "quotaPercent", skip_serializing_if = "Option::is_none")]
    quota_percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tiers: Option<Vec<AiModelTier>>,
    #[serde(rename = "selectedTierId", skip_serializing_if = "Option::is_none")]
    selected_tier_id: Option<String>,
}

#[tauri::command]
async fn fetch_gemini_models_with_quota(access_token: String, project_id: String) -> Result<Vec<AntigravityModel>, String> {
    // Model IDs match verified working models from opencode-ag-auth model-resolver.ts
    // Model list synced 100% dengan server.cjs MODELS array
    let mut models = vec![
        AntigravityModel {
            id: "gemini-3.1-pro".into(),
            name: "gemini-3.1-pro".into(),
            display_name: "Gemini 3.1 Pro".into(),
            description: "Google's most capable model with advanced thinking".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_535,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: Some("gemini-3.1-pro-low".into()),
            tiers: Some(vec![
                AiModelTier { id: "gemini-3.1-pro-low".into(), name: "Low Thinking".into() },
                AiModelTier { id: "gemini-3.1-pro-high".into(), name: "High Thinking".into() },
            ]),
        },
        AntigravityModel {
            id: "gemini-3-flash".into(),
            name: "gemini-3-flash".into(),
            display_name: "Gemini 3 Flash".into(),
            description: "Fast and versatile model for everyday tasks".into(),
            input_token_limit: 1_048_576,
            output_token_limit: 65_536,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: Some("gemini-3-flash-minimal".into()),
            tiers: Some(vec![
                AiModelTier { id: "gemini-3-flash-minimal".into(), name: "Minimal Thinking".into() },
                AiModelTier { id: "gemini-3-flash-low".into(), name: "Low Thinking".into() },
                AiModelTier { id: "gemini-3-flash-medium".into(), name: "Medium Thinking".into() },
                AiModelTier { id: "gemini-3-flash-high".into(), name: "High Thinking".into() },
            ]),
        },
        AntigravityModel {
            id: "claude-sonnet-4-6".into(),
            name: "claude-sonnet-4-6".into(),
            display_name: "Claude Sonnet 4.6".into(),
            description: "Anthropic's balanced model for high intelligence and speed".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: None,
            tiers: None,
        },
        AntigravityModel {
            id: "claude-sonnet-4-6-thinking".into(),
            name: "claude-sonnet-4-6-thinking".into(),
            display_name: "Claude Sonnet 4.6 (Thinking)".into(),
            description: "Claude Sonnet extended thinking capabilities".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: Some("claude-sonnet-4-6-thinking-low".into()),
            tiers: Some(vec![
                AiModelTier { id: "claude-sonnet-4-6-thinking-low".into(), name: "Low Thinking".into() },
                AiModelTier { id: "claude-sonnet-4-6-thinking-max".into(), name: "Max Thinking".into() },
            ]),
        },
        AntigravityModel {
            id: "claude-opus-4-6-thinking".into(),
            name: "claude-opus-4-6-thinking".into(),
            display_name: "Claude Opus 4.6 (Thinking)".into(),
            description: "Claude's most powerful reasoning model".into(),
            input_token_limit: 200_000,
            output_token_limit: 64_000,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: Some("claude-opus-4-6-thinking-low".into()),
            tiers: Some(vec![
                AiModelTier { id: "claude-opus-4-6-thinking-low".into(), name: "Low Thinking".into() },
                AiModelTier { id: "claude-opus-4-6-thinking-max".into(), name: "Max Thinking".into() },
            ]),
        },
        AntigravityModel {
            id: "gpt-oss-120b-medium".into(),
            name: "gpt-oss-120b-medium".into(),
            display_name: "GPT-OSS 120B (Medium)".into(),
            description: "High-performance open weights model".into(),
            input_token_limit: 128_000,
            output_token_limit: 4_000,
            source: "antigravity".into(),
            quota_percent: None,
            selected_tier_id: None,
            tiers: None,
        },
    ];

    // Fetch quota dari API
    let client = Client::new();
    let url = format!("{}/{}:fetchAvailableModels", ENDPOINT_PROD, API_VERSION);
    let body = serde_json::json!({
        "project": project_id
    });

    // Mengambil sisa kuota (Bypass panic, abaikan jika gagal, tetap return list kosong/awal)
    if let Ok(res) = client.post(&url)
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json")
        .header("User-Agent", HEADER_UA_ANTIGRAVITY)
        .json(&body)
        .send()
        .await
    {
        if res.status().is_success() {
            if let Ok(json) = res.json::<Value>().await {
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

                        // Pass 2: Jika tidak exact match, match ke base model jika key ada di dalam tiers
                        // Misalnya key API = "gemini-3.1-pro-high", masuk kuotanya ke base model "gemini-3.1-pro"
                        if !matched {
                            for model in models.iter_mut() {
                                if let Some(ref tiers) = model.tiers {
                                    if tiers.iter().any(|t| t.id == *key) {
                                        // Update persentase kuota di base model
                                        model.quota_percent = Some(percent);
                                        matched = true;
                                        break;
                                    }
                                }
                            }
                        }

                        // Pass 3: Fallback loose partial match
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


// ── Execute Model Prompt — Non-streaming with retry (matching server.cjs chatWithModelRetry) ──
#[tauri::command]
async fn execute_model_prompt(app: AppHandle, token: String, project_id: String, model: String, prompt: String) -> Result<(), String> {
    let effective_project = if project_id.trim().is_empty() {
        DEFAULT_PROJECT_ID.to_string()
    } else {
        project_id
    };

    // Body persis seperti server.cjs chatWithModel (tanpa properti thinkingConfig, biarkan API server-side parse -high otomatis)
    let payload = serde_json::json!({
        "project": effective_project,
        "model": model,
        "request": {
            "contents": [{ "role": "user", "parts": [{ "text": prompt }] }]
        }
    });

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

        for endpoint in &chat_endpoints {
            // URL: /v1internal:generateContent (NON-STREAMING)
            let url = format!("{}/{}:generateContent", endpoint, API_VERSION);

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
            
            if res.status().is_success() {
                let raw_text = res.text().await.unwrap_or_default();
                if let Ok(data) = serde_json::from_str::<Value>(&raw_text) {
                    response_data = Some(data);
                    success = true;
                    break;
                } else {
                    last_err = "Gagal parsing respons JSON yang valid".to_string();
                    continue;
                }
            }

            // Jika GAGAL pada endpoint ini:
            let err_text = res.text().await.unwrap_or_default();
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
                // Check API-level error JSON
                if let Some(err) = data.get("error") {
                    let err_code = err.get("code").and_then(|c| c.as_u64()).unwrap_or(0);
                    let err_status = err.get("status").and_then(|s| s.as_str()).unwrap_or("");
                    let raw_msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("Error tidak diketahui dari API");

                    let friendly_msg = if err_status == "RESOURCE_EXHAUSTED" || raw_msg.contains("quota") {
                        format!("Kuota untuk model {} sudah habis. Coba gunakan model lain.", model)
                    } else if err_code == 503 || raw_msg.contains("No capacity") {
                        format!("Model {} sedang penuh. Coba beberapa saat lagi atau gunakan model lain.", model)
                    } else if err_code == 429 {
                        format!("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.")
                    } else {
                        format!("Error AI: {}", raw_msg)
                    };

                    let _ = app.emit("ai_error", &friendly_msg);
                    return Err(friendly_msg);
                }

                let candidates = data.get("candidates").or_else(|| data.pointer("/response/candidates"));
                let mut text = String::new();

                if let Some(cands) = candidates.and_then(|c| c.as_array()) {
                    if let Some(first) = cands.first() {
                        if let Some(parts) = first.pointer("/content/parts").and_then(|p| p.as_array()) {
                            for part in parts {
                                let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                                if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                                    if !t.is_empty() && !is_thought {
                                        text = t.to_string();
                                        break;
                                    }
                                }
                            }
                            if text.is_empty() {
                                if let Some(first_part) = parts.first() {
                                    if let Some(t) = first_part.get("text").and_then(|t| t.as_str()) {
                                        text = t.to_string();
                                    }
                                }
                            }
                        }
                    }
                }

                if text.is_empty() {
                    text = "(Respon kosong — model tidak mengembalikan teks)".to_string();
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
            let _ = app.emit("ai_chunk", retry_msg.as_str());

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
            refresh_access_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
