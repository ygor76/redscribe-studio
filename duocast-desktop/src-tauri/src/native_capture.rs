use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use miniaudio::{Backend, Context as AudioContext, Device, DeviceConfig, DeviceType, Format};
use serde::Serialize;
use tauri::{ipc::Response, State};
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::encoder::{ImageEncoder, ImageEncoderPixelFormat, ImageFormat};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

#[derive(Clone, Copy)]
enum NativeTarget {
    Monitor(Monitor),
    Window(Window),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSource {
    id: String,
    kind: String,
    title: String,
    subtitle: String,
    width: u32,
    height: u32,
}

#[derive(Default)]
struct VideoShared {
    seq: u64,
    width: u32,
    height: u32,
    jpeg: Vec<u8>,
}

struct AudioChunk {
    seq: u64,
    samples: Vec<f32>,
}

struct AudioShared {
    seq: u64,
    sample_rate: u32,
    channels: u32,
    chunks: VecDeque<AudioChunk>,
}

impl Default for AudioShared {
    fn default() -> Self {
        Self { seq: 0, sample_rate: 48_000, channels: 2, chunks: VecDeque::new() }
    }
}

#[derive(Clone)]
struct CaptureFlags {
    video: Arc<Mutex<VideoShared>>,
}

struct CaptureHandler {
    video: Arc<Mutex<VideoShared>>,
    encoder: ImageEncoder,
    scratch: Vec<u8>,
    last_frame: Instant,
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = CaptureFlags;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let encoder = ImageEncoder::new(ImageFormat::Jpeg, ImageEncoderPixelFormat::Bgra8)
            .map_err(|e| e.to_string())?;
        Ok(Self {
            video: ctx.flags.video,
            encoder,
            scratch: Vec::new(),
            last_frame: Instant::now() - Duration::from_millis(100),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame<'_>,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.last_frame.elapsed() < Duration::from_millis(50) {
            return Ok(());
        }
        self.last_frame = Instant::now();

        let width = frame.width();
        let height = frame.height();
        let buffer = frame.buffer().map_err(|e| e.to_string())?;
        let raw = buffer.as_nopadding_buffer(&mut self.scratch);
        let jpeg = self.encoder.encode(raw, width, height).map_err(|e| e.to_string())?;

        if let Ok(mut shared) = self.video.lock() {
            shared.seq = shared.seq.wrapping_add(1).max(1);
            shared.width = width;
            shared.height = height;
            shared.jpeg = jpeg;
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

type VideoControl = CaptureControl<CaptureHandler, String>;

pub struct NativeCaptureState {
    targets: Mutex<HashMap<String, NativeTarget>>,
    video: Arc<Mutex<VideoShared>>,
    audio: Arc<Mutex<AudioShared>>,
    video_control: Mutex<Option<VideoControl>>,
    audio_device: Mutex<Option<Device>>,
}

impl Default for NativeCaptureState {
    fn default() -> Self {
        Self {
            targets: Mutex::new(HashMap::new()),
            video: Arc::new(Mutex::new(VideoShared::default())),
            audio: Arc::new(Mutex::new(AudioShared::default())),
            video_control: Mutex::new(None),
            audio_device: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStartResult {
    ok: bool,
    audio_enabled: bool,
}

fn capture_settings<T>(item: T, flags: CaptureFlags) -> Settings<CaptureFlags, T>
where
    T: TryInto<GraphicsCaptureItemType>,
{
    Settings::new(
        item,
        CursorCaptureSettings::WithCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Include,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(33)),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    )
}

fn stop_video(state: &NativeCaptureState) {
    if let Ok(mut guard) = state.video_control.lock() {
        if let Some(control) = guard.take() {
            let _ = control.stop();
        }
    }
}

fn stop_audio(state: &NativeCaptureState) {
    if let Ok(mut guard) = state.audio_device.lock() {
        if let Some(device) = guard.take() {
            let _ = device.stop();
        }
    }
    if let Ok(mut audio) = state.audio.lock() {
        audio.chunks.clear();
        audio.seq = 0;
    }
}

fn start_loopback_audio(shared: Arc<Mutex<AudioShared>>) -> Result<Device, String> {
    let context = AudioContext::new(&[Backend::Wasapi], None).map_err(|e| e.to_string())?;
    let mut config = DeviceConfig::new(DeviceType::Loopback);
    config.capture_mut().set_format(Format::F32);
    config.capture_mut().set_channels(2);
    config.set_sample_rate(48_000);

    let shared_for_cb = shared.clone();
    config.set_data_callback(move |_device, _output, input| {
        let samples = input.as_samples::<f32>();
        if samples.is_empty() {
            return;
        }
        if let Ok(mut audio) = shared_for_cb.lock() {
            audio.seq = audio.seq.wrapping_add(1).max(1);
            let seq = audio.seq;
            audio.chunks.push_back(AudioChunk { seq, samples: samples.to_vec() });
            while audio.chunks.len() > 120 {
                audio.chunks.pop_front();
            }
        }
    });

    let device = Device::new(Some(context), &config).map_err(|e| e.to_string())?;
    device.start().map_err(|e| e.to_string())?;
    Ok(device)
}

#[tauri::command]
pub fn native_list_sources(state: State<'_, NativeCaptureState>) -> Result<Vec<NativeSource>, String> {
    let mut items = Vec::new();
    let mut targets = state.targets.lock().map_err(|_| "Falha ao acessar as fontes de captura.".to_string())?;
    targets.clear();

    let monitors = Monitor::enumerate().map_err(|e| e.to_string())?;
    for monitor in monitors {
        let index = monitor.index().unwrap_or(items.len() + 1);
        let width = monitor.width().unwrap_or(0);
        let height = monitor.height().unwrap_or(0);
        let name = monitor.name().unwrap_or_else(|_| format!("Tela {index}"));
        let id = format!("monitor:{index}");
        targets.insert(id.clone(), NativeTarget::Monitor(monitor));
        items.push(NativeSource {
            id,
            kind: "monitor".into(),
            title: format!("Tela {index}"),
            subtitle: if width > 0 && height > 0 { format!("{name} · {width} × {height}") } else { name },
            width,
            height,
        });
    }

    let windows = Window::enumerate().map_err(|e| e.to_string())?;
    for (pos, window) in windows.into_iter().enumerate() {
        if !window.is_valid() {
            continue;
        }
        let title = window.title().unwrap_or_default().trim().to_string();
        if title.is_empty() || title == "DuoCast" {
            continue;
        }
        let width = window.width().unwrap_or(0);
        let height = window.height().unwrap_or(0);
        if width < 160 || height < 100 {
            continue;
        }
        let process = window.process_name().unwrap_or_default();
        let id = format!("window:{pos}");
        targets.insert(id.clone(), NativeTarget::Window(window));
        items.push(NativeSource {
            id,
            kind: "window".into(),
            title: title.chars().take(80).collect(),
            subtitle: if process.is_empty() { format!("{width} × {height}") } else { format!("{process} · {width} × {height}") },
            width,
            height,
        });
    }

    Ok(items)
}

#[tauri::command]
pub fn native_start_capture(
    source_id: String,
    with_audio: bool,
    state: State<'_, NativeCaptureState>,
) -> Result<NativeStartResult, String> {
    stop_video(&state);
    stop_audio(&state);

    if let Ok(mut video) = state.video.lock() {
        *video = VideoShared::default();
    }
    if let Ok(mut audio) = state.audio.lock() {
        *audio = AudioShared::default();
    }

    let target = {
        let targets = state.targets.lock().map_err(|_| "Falha ao acessar a fonte escolhida.".to_string())?;
        targets.get(&source_id).copied().ok_or_else(|| "A fonte escolhida não está mais disponível. Abra o seletor novamente.".to_string())?
    };

    let flags = CaptureFlags { video: state.video.clone() };
    let control = match target {
        NativeTarget::Monitor(monitor) => CaptureHandler::start_free_threaded(capture_settings(monitor, flags))
            .map_err(|e| e.to_string())?,
        NativeTarget::Window(window) => CaptureHandler::start_free_threaded(capture_settings(window, flags))
            .map_err(|e| e.to_string())?,
    };

    *state.video_control.lock().map_err(|_| "Falha ao iniciar a captura.".to_string())? = Some(control);

    let mut audio_enabled = false;
    if with_audio {
        match start_loopback_audio(state.audio.clone()) {
            Ok(device) => {
                *state.audio_device.lock().map_err(|_| "Falha ao manter o áudio do sistema.".to_string())? = Some(device);
                audio_enabled = true;
            }
            Err(_) => {
                audio_enabled = false;
            }
        }
    }

    Ok(NativeStartResult { ok: true, audio_enabled })
}

#[tauri::command]
pub fn native_capture_frame(after_seq: u64, state: State<'_, NativeCaptureState>) -> Result<Response, String> {
    let video = state.video.lock().map_err(|_| "Falha ao ler o quadro da captura.".to_string())?;
    if video.seq == 0 || video.seq <= after_seq || video.jpeg.is_empty() {
        return Ok(Response::new(Vec::new()));
    }
    let mut out = Vec::with_capacity(16 + video.jpeg.len());
    out.extend_from_slice(&video.seq.to_le_bytes());
    out.extend_from_slice(&video.width.to_le_bytes());
    out.extend_from_slice(&video.height.to_le_bytes());
    out.extend_from_slice(&video.jpeg);
    Ok(Response::new(out))
}

#[tauri::command]
pub fn native_capture_audio(after_seq: u64, state: State<'_, NativeCaptureState>) -> Result<Response, String> {
    let audio = state.audio.lock().map_err(|_| "Falha ao ler o áudio do sistema.".to_string())?;
    let mut selected = Vec::new();
    let mut last_seq = after_seq;
    for chunk in audio.chunks.iter().filter(|chunk| chunk.seq > after_seq).take(24) {
        last_seq = chunk.seq;
        selected.extend_from_slice(&chunk.samples);
    }
    if selected.is_empty() {
        return Ok(Response::new(Vec::new()));
    }

    let mut out = Vec::with_capacity(16 + selected.len() * 4);
    out.extend_from_slice(&last_seq.to_le_bytes());
    out.extend_from_slice(&audio.sample_rate.to_le_bytes());
    out.extend_from_slice(&audio.channels.to_le_bytes());
    for sample in selected {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    Ok(Response::new(out))
}

#[tauri::command]
pub fn native_stop_capture(state: State<'_, NativeCaptureState>) -> Result<(), String> {
    stop_video(&state);
    stop_audio(&state);
    Ok(())
}
