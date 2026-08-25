mod native_capture;

use native_capture::{
    native_capture_audio, native_capture_frame, native_list_sources, native_start_capture,
    native_stop_capture, NativeCaptureState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(NativeCaptureState::default())
    .invoke_handler(tauri::generate_handler![
      native_list_sources,
      native_start_capture,
      native_capture_frame,
      native_capture_audio,
      native_stop_capture
    ])
    .run(tauri::generate_context!())
    .expect("error while running DuoCast Desktop");
}
