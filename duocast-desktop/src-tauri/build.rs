const COMMANDS: &[&str] = &[
  "native_list_sources",
  "native_start_capture",
  "native_capture_frame",
  "native_capture_audio",
  "native_stop_capture",
];

fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
  )
  .expect("failed to build DuoCast Desktop permissions");
}
