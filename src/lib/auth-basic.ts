// Poin 1: Autentikasi Google OAuth 2.0 (Mandiri / PKCE) & Auto-Refresh Token
// Kode ini diadopsi utuh dari server.cjs khusus untuk dieksekusi saat VocaCode berada dalam konfigurasi AppMode === 'BASIC'

import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './store';
import { logger } from './logger';

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

export function encodeState(obj: any): string {
    const str = JSON.stringify(obj);
    const encoded = btoa(str);
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(state: string): any {
    try {
        const normalized = state.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------------
// 1B. Antrean Perlindungan Antilompatan-Balik (Race Condition) saat Refresh
// Sama persis dengan variabel activeRefreshPromise di server.cjs baris 135-174
// Ditambahkan: cek expiresAt (buffer 30 detik) sebelum melakukan refresh
// ----------------------------------------------------------------------
let isRefreshing = false;
let refreshQueue: { resolve: (val: string) => void, reject: (err: any) => void }[] = [];

/**
 * Menjalankan auto-refresh token yang dicegat antrean agar ketika
 * API VocaCode (BASIC) meledak bersamaan, hanya 1 permintaan Google Token
 * yang terbang, mencegah terblokir API.
 * 
 * Poin 2 (server.cjs baris 136-174):
 * - Cek apakah token masih valid via expiresAt (buffer 30s sudah diterapkan saat set)
 * - Jika masih valid, return token aktif tanpa network call
 * - Jika expired/hampir expired, lakukan refresh via Rust backend
 * - Update expiresAt setelah refresh berhasil
 */
export async function refreshAccessTokenBasicSafe(refreshToken: string): Promise<string> {
    const store = useAppStore.getState();

    // Cek apakah token masih valid (server.cjs baris 160: expiresAt = now + expires_in*1000 - 30000)
    if (store.tokenExpiresAt && Date.now() < store.tokenExpiresAt && store.oauthToken) {
        logger.info('AUTH-REFRESH', 'TokenValid', `Token masih valid (berlaku ${Math.round((store.tokenExpiresAt - Date.now()) / 1000)}s lagi)`);
        return store.oauthToken;
    }

    if (isRefreshing) {
        // Jika sedang me-refresh, gabung ke antrean dan suspend promise
        logger.info('AUTH-REFRESH', 'QueueJoin', 'Menunggu antrean refresh token...');
        return new Promise((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;
    logger.info('AUTH-REFRESH', 'Start', 'Melakukan refresh token...');

    try {
        // Alih-alih melakukan HTTP Call node.js, pada VocaCode kita memanggil 
        // engine Tauri Rust agar menghindari pemblokiran CORS browser client-side
        const rawJson: string = await invoke('refresh_access_token', { refreshToken });
        const result = JSON.parse(rawJson);

        if (result.access_token) {
            // Simpan expiresAt dengan buffer 30 detik (server.cjs baris 160)
            const expiresIn = result.expires_in || 3599; // Default 3599s dari Google
            const expiresAt = Date.now() + (expiresIn * 1000) - 30000; // buffer 30 detik

            // Update Zustand store
            useAppStore.setState({ 
                oauthToken: result.access_token,
                tokenExpiresAt: expiresAt
            });

            logger.info('AUTH-REFRESH', 'Success', `Token di-refresh! Berlaku ${expiresIn}s (buffer 30s diterapkan)`);

            // Berhasil: Bebaskan semua antrean (Resolve semua promise suspend)
            refreshQueue.forEach(p => p.resolve(result.access_token));
            refreshQueue = [];
            return result.access_token;
        } else {
            throw new Error("Sistem tak menemukan access_token pada siklus respon");
        }
    } catch (err: any) {
        logger.error('AUTH-REFRESH', 'Failed', err?.message || err);
        // Gagal: Hancurkan semua antrean dengan melempar error paralel
        refreshQueue.forEach(p => p.reject(err));
        refreshQueue = [];
        throw err;
    } finally {
        // Kembalikan saklar penyegaran ke netral
        isRefreshing = false;
    }
}

