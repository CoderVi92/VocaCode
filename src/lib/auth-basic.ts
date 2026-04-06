// Poin 1: Autentikasi Google OAuth 2.0 (Mandiri / PKCE) & Auto-Refresh Token
// Kode ini diadopsi utuh dari server.cjs khusus untuk dieksekusi saat VocaCode berada dalam konfigurasi AppMode === 'BASIC'

import { invoke } from '@tauri-apps/api/core';

// ----------------------------------------------------------------------
// 1A. Metode PKCE (Akurat dengan server.cjs - tanpa library pihak ketiga)
// ----------------------------------------------------------------------
export function generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += charset[array[i] % charset.length];
    }
    return result;
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Melakukan konversi Base64 URL Safe (mengimitasi crypto.createHash yang ada di Node.js server.cjs)
    const base64 = btoa(String.fromCharCode.apply(null, hashArray));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ----------------------------------------------------------------------
// 1B. Antrean Perlindungan Antilompatan-Balik (Race Condition) saat Refresh
// Sama persis dengan variabel isRefreshing dan refreshQueue di server.cjs
// ----------------------------------------------------------------------
let isRefreshing = false;
let refreshQueue: { resolve: (val: string) => void, reject: (err: any) => void }[] = [];

/**
 * Menjalankan auto-refresh token yang dicegat antrean agar ketika
 * API VocaCode (BASIC) meledak bersamaan, hanya 1 permintaan Google Token
 * yang terbang, mencegah terblokir API.
 */
export async function refreshAccessTokenBasicSafe(refreshToken: string): Promise<string> {
    if (isRefreshing) {
        // Jika sedang me-refresh, gabung ke antrean dan suspend promise
        return new Promise((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;

    try {
        // Alih-alih melakukan HTTP Call node.js, pada VocaCode kita memanggil 
        // engine Tauri Rust agar menghindari pemblokiran CORS browser client-side
        const rawJson: string = await invoke('refresh_access_token', { refreshToken });
        const result = JSON.parse(rawJson);

        if (result.access_token) {
            // Berhasil: Bebaskan semua antrean (Resolve semua promise suspend)
            refreshQueue.forEach(p => p.resolve(result.access_token));
            refreshQueue = [];
            return result.access_token;
        } else {
            throw new Error("Sistem tak menemukan access_token pada siklus respon");
        }
    } catch (err: any) {
        // Gagal: Hancurkan semua antrean dengan melempar error paralel
        refreshQueue.forEach(p => p.reject(err));
        refreshQueue = [];
        throw err;
    } finally {
        // Kembalikan saklar penyegaran ke netral
        isRefreshing = false;
    }
}
