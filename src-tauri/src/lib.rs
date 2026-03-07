use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};

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

#[derive(Deserialize)]
struct GeminiModelsResponse {
    models: Vec<GeminiModel>,
}

#[derive(Deserialize)]
struct GeminiModel {
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[tauri::command]
async fn fetch_gemini_models(token: String) -> Result<Vec<String>, String> {
    let client = Client::new();
    let res = client.get("https://generativelanguage.googleapis.com/v1beta/models")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !res.status().is_success() {
        return Err(format!("Google API Error: {}", res.status()));
    }
    
    let json: GeminiModelsResponse = res.json().await.map_err(|e| e.to_string())?;
    
    let mut models = vec![];
    for m in json.models {
        if m.name.contains("gemini") {
            models.push(m.display_name);
        }
    }
    
    if models.is_empty() {
        models = vec!["Gemini 2.5 Pro".into(), "Gemini 1.5 Flash".into()];
    }
    
    Ok(models)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![login_oauth_proxy, fetch_gemini_models])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
