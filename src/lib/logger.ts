import { invoke } from "@tauri-apps/api/core";

/**
 * Utilitas Logger Global untuk VocaCode
 * Mengirim pesan ke backend Rust untuk ditulis ke Desktop/vocacode-debug.log
 */
export const logger = {
  info: async (module: string, action: string, message: any) => {
    try {
      const msgString = typeof message === 'string' 
        ? message 
        : JSON.stringify(message, null, 2);
      
      await invoke("write_debug_log", {
        module: `[INFO] ${module}`,
        action,
        message: msgString,
      });
    } catch (err) {
      console.error("Logger failed:", err);
    }
  },

  error: async (module: string, action: string, message: any) => {
    try {
      const msgString = typeof message === 'string' 
        ? message 
        : JSON.stringify(message, null, 2);

      await invoke("write_debug_log", {
        module: `[ERROR] ${module}`,
        action,
        message: msgString,
      });
    } catch (err) {
      console.error("Logger failed:", err);
    }
  },

  ui: async (action: string, detail?: string) => {
    try {
      await invoke("write_debug_log", {
        module: "UI-INTERACTION",
        action,
        message: detail || "User interaction triggered",
      });
    } catch (err) {
      console.error("Logger failed:", err);
    }
  }
};
