// src-tauri/src/wsl_pin.rs

//! Premier plan sous WSL.
//!
//! Sous WSL, la fenêtre est affichée par Windows (WSLg) : ni GTK ni le
//! compositeur Linux ne peuvent la garder au-dessus des autres fenêtres
//! Windows. On le demande donc à Windows lui-même, par powershell.exe que WSL
//! sait lancer, en appelant SetWindowPos sur la fenêtre qui porte notre titre.

use base64::Engine;
use std::process::Command;

/// Vrai si le noyau est celui de WSL (« …-microsoft-standard-WSL2 », ou
/// « …-Microsoft » pour WSL 1).
pub fn is_wsl_kernel(osrelease: &str) -> bool {
    osrelease.to_ascii_lowercase().contains("microsoft")
}

pub fn is_wsl() -> bool {
    std::fs::read_to_string("/proc/sys/kernel/osrelease").is_ok_and(|r| is_wsl_kernel(&r))
}

/// Script PowerShell qui épingle (ou désépingle) notre fenêtre et affiche
/// « OK <nombre> », ou « FAIL <raison> » avec de quoi comprendre l'échec : le
/// code d'erreur de Windows, ou les titres des fenêtres de WSLg (msrdc).
///
/// Notre fenêtre : un titre qui commence par `title`, ou qui le contient pour
/// une fenêtre de WSLg, au cas où celui-ci l'entourerait d'autre chose.
///
/// Du C# compilable par Windows PowerShell 5.1 (C# 5) : c'est celui de toutes
/// les installations de Windows, PowerShell 7 ne l'est pas toujours.
pub fn pin_script(title: &str, on_top: bool) -> String {
    // Entre apostrophes, PowerShell ne remplace rien sauf l'apostrophe doublée.
    let title = title.replace('\'', "''");
    let on_top = if on_top { "$true" } else { "$false" };
    format!(
        r#"$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class OsuPlayerPin {{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

    private static string ProcessName(IntPtr hWnd) {{
        uint processId;
        GetWindowThreadProcessId(hWnd, out processId);
        try {{ return Process.GetProcessById((int)processId).ProcessName; }}
        catch (Exception) {{ return "?"; }}
    }}

    public static string Pin(string title, bool onTop) {{
        int pinned = 0;
        List<string> refused = new List<string>();
        List<string> wslgWindows = new List<string>();
        // HWND_TOPMOST ou HWND_NOTOPMOST.
        IntPtr insertAfter = new IntPtr(onTop ? -1 : -2);
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {{
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder text = new StringBuilder(256);
            GetWindowText(hWnd, text, text.Capacity);
            string caption = text.ToString();
            if (caption.Length == 0) return true;
            string process = ProcessName(hWnd);
            bool wslg = process.Equals("msrdc", StringComparison.OrdinalIgnoreCase);
            if (wslg) wslgWindows.Add("\"" + caption + "\"");
            bool ours = caption.StartsWith(title, StringComparison.Ordinal) || (wslg && caption.Contains(title));
            if (!ours) return true;
            // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE : seul le rang change.
            if (SetWindowPos(hWnd, insertAfter, 0, 0, 0, 0, 0x0013)) pinned++;
            else refused.Add("\"" + caption + "\" (" + process + ", Windows error " + Marshal.GetLastWin32Error() + ")");
            return true;
        }}, IntPtr.Zero);
        if (pinned > 0) return "OK " + pinned;
        if (refused.Count > 0) return "FAIL Windows refused: " + string.Join(", ", refused.ToArray());
        return "FAIL no window titled \"" + title + "\". WSLg windows: "
            + (wslgWindows.Count > 0 ? string.Join(", ", wslgWindows.ToArray()) : "none");
    }}
}}
'@
[OsuPlayerPin]::Pin('{title}', {on_top})
"#
    )
}

/// Le script sous la forme qu'attend -EncodedCommand : base64 de l'UTF-16LE.
/// Plus sûr que -Command, dont les guillemets traversent mal l'appel depuis
/// WSL, et que l'entrée standard, où PowerShell lit les blocs ligne à ligne.
pub fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Épingle ou désépingle la fenêtre `title` côté Windows. Renvoie une erreur
/// si powershell.exe manque ou si aucune fenêtre ne porte ce titre.
pub fn set_topmost(title: &str, on_top: bool) -> Result<(), String> {
    let encoded = encode_command(&pin_script(title, on_top));
    let args = ["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded];
    // Le PATH de WSL inclut d'ordinaire celui de Windows, mais pas toujours
    // (appendWindowsPath = false) : le chemin habituel sert de repli.
    // Seulement s'il est introuvable : une autre erreur (l'interopérabilité de
    // WSL coupée, par exemple) est celle à montrer.
    let output = match Command::new("powershell.exe").args(args).output() {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Command::new("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
                .args(args)
                .output()
        }
        result => result,
    }
    .map_err(|e| format!("powershell.exe: {e}"))?;
    if !output.status.success() {
        return Err(short(&String::from_utf8_lossy(&output.stderr)));
    }
    parse_result(&String::from_utf8_lossy(&output.stdout))
}

/// Lit la réponse du script : « OK <nombre> » ou « FAIL <raison> ».
fn parse_result(stdout: &str) -> Result<(), String> {
    let line = stdout.trim();
    if line.starts_with("OK ") {
        Ok(())
    } else if let Some(reason) = line.strip_prefix("FAIL ") {
        Err(short(reason))
    } else {
        Err(short(line))
    }
}

/// Assez pour comprendre l'échec dans le message de l'interface, sans pavé :
/// une erreur de compilation de PowerShell court sur des dizaines de lignes.
fn short(text: &str) -> String {
    const MAX_CHARS: usize = 400;
    let text = text.trim();
    match text.char_indices().nth(MAX_CHARS) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noyau_wsl_reconnu() {
        assert!(is_wsl_kernel("5.15.167.4-microsoft-standard-WSL2\n"));
        assert!(is_wsl_kernel("4.4.0-19041-Microsoft"));
        assert!(!is_wsl_kernel("6.12.12-amd64"));
    }

    #[test]
    fn script_vise_le_titre_et_le_sens_demandes() {
        let pin = pin_script("osu! Player", true);
        assert!(pin.ends_with("[OsuPlayerPin]::Pin('osu! Player', $true)\n"));
        assert!(pin_script("osu! Player", false).contains("::Pin('osu! Player', $false)"));
    }

    #[test]
    fn apostrophe_du_titre_doublee_pour_powershell() {
        assert!(pin_script("Shin's Player", true).contains("::Pin('Shin''s Player', $true)"));
    }

    #[test]
    fn reponse_du_script_lue() {
        assert_eq!(parse_result("OK 1\r\n"), Ok(()));
        assert_eq!(
            parse_result("FAIL Windows refused: \"osu! Player\" (msrdc, Windows error 5)\r\n"),
            Err("Windows refused: \"osu! Player\" (msrdc, Windows error 5)".to_string())
        );
        assert_eq!(parse_result(""), Err(String::new()));
    }

    #[test]
    fn raison_trop_longue_raccourcie() {
        let long = "é".repeat(1000);
        let cut = short(&long);
        assert_eq!(cut.chars().count(), 401);
        assert!(cut.ends_with('…'));
        assert_eq!(short("  court \n"), "court");
    }

    #[test]
    fn accolades_du_csharp_conservees() {
        let script = pin_script("osu! Player", true);
        assert!(script.contains("public static class OsuPlayerPin {\n"));
        assert!(!script.contains("{{"));
    }

    #[test]
    fn commande_encodee_en_utf16_little_endian() {
        // « A! » en UTF-16LE : 41 00 21 00.
        assert_eq!(encode_command("A!"), "QQAhAA==");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encode_command("épingle"))
            .unwrap();
        let units: Vec<u16> = decoded.chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        assert_eq!(String::from_utf16(&units).unwrap(), "épingle");
    }
}
