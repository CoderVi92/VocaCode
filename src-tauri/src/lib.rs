use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use eventsource_stream::Eventsource;
use serde_json::Value;

#[tauri::command]
async fn login_oauth_proxy(app: tauri::AppHandle) -> Result<String, String> {
    let server = Server::http("127.0.0.1:8085").map_err(|e| e.to_string())?;
    
    let auth_url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com&redirect_uri=http://localhost:8085/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/cloud-platform%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile";
    
    app.opener().open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;

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
                                // Basic URL decoding for characters commonly present in Google Codes
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
    }

    let client = Client::new();
    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&TokenRequest {
            client_id: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com".into(),
            client_secret: "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".into(),
            code: auth_code,
            grant_type: "authorization_code".into(),
            redirect_uri: "http://localhost:8085/oauth2callback".into(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token Exchange Error: {}", err_text));
    }

    let token_data: TokenResponse = res.json().await.map_err(|e| e.to_string())?;

    Ok(token_data.access_token)
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
    // Hardcoded List based on fares-antigravity-oauth for VocaCode God Mode
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
async fn execute_model_prompt(app: AppHandle, token: String, model: String, prompt: String) -> Result<(), String> {
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

    let payload = serde_json::json!({
        "project": "rising-fact-p41fc",
        "model": base_model,
        "request": {
            "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
            "generationConfig": {
                "thinkingConfig": {
                    "thinkingLevel": thinking_level
                }
            }
        },
        "requestType": "agent",
        "userAgent": "antigravity",
        "requestId": format!("agent-{}", uuid::Uuid::new_v4())
    });

    let client = reqwest::Client::new();
    let res = client.post("https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse")
        .bearer_auth(&token)
        .header("User-Agent", "antigravity/1.18.3 windows/amd64")
        .header("X-Goog-Api-Client", "google-cloud-sdk vscode_cloudshelleditor/0.1")
        .header("Client-Metadata", r#"{"ideType":"ANTIGRAVITY","platform":"WINDOWS","pluginType":"GEMINI"}"#)
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
