use tauri_plugin_opener::OpenerExt;
use tiny_http::{Server, Response, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[tauri::command]
async fn login_oauth_proxy(app: tauri::AppHandle) -> Result<String, String> {
    let server = Server::http("127.0.0.1:11434").map_err(|e| e.to_string())?;
    
    let auth_url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=1046184518090-a54l82sjk4fbrthv6o39ic5d552i0q92.apps.googleusercontent.com&redirect_uri=http://localhost:11434/callback&response_type=token&scope=email";
    
    app.opener().open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;

    let token = tauri::async_runtime::spawn_blocking(move || {
        for request in server.incoming_requests() {
            let url = request.url();
            if url.starts_with("/callback") {
                let mut token_val = String::new();
                if let Some(query) = url.split('?').nth(1) {
                    for param in query.split('&') {
                        if param.starts_with("token=") {
                            token_val = param.trim_start_matches("token=").to_string();
                        } else if param.starts_with("access_token=") {
                            token_val = param.trim_start_matches("access_token=").to_string();
                        }
                    }
                }
                
                let html = r#"
                <!DOCTYPE html><html><body style="background:#0b0d11;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                <div style="text-align:center;"><h2>Login Berhasil</h2><p>Silakan tutup tab ini dan kembali ke aplikasi VocaCode Anda.</p>
                <script>
                  if (window.location.hash.includes('access_token')) {
                      let hash = window.location.hash.substring(1);
                      window.location.href = "/callback?" + hash;
                  } else {
                     setTimeout(() => window.close(), 2000);
                  }
                </script></div></body></html>"#;

                if token_val.is_empty() {
                    let mut response = Response::from_string(html);
                    response.add_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                    let _ = request.respond(response);
                    continue; 
                }

                let mut response = Response::from_string(html);
                response.add_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                let _ = request.respond(response);
                
                return Ok(token_val);
            }
        }
        Err("Server shut down".to_string())
    }).await.map_err(|e| e.to_string())??;

    Ok(token)
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
