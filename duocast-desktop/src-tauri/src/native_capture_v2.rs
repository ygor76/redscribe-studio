use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{ipc::Response, State};
use wasapi::{initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};
use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::dxgi_duplication_api::{DxgiDuplicationApi, DxgiDuplicationFormat, Error as DxgiError};
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
    frame_interval: Duration,
}

struct CaptureHandler {
    video: Arc<Mutex<VideoShared>>,
    encoder: ImageEncoder,
    scratch: Vec<u8>,
    last_frame: Instant,
    frame_interval: Duration,
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
            last_frame: Instant::now() - Duration::from_secs(1),
            frame_interval: ctx.flags.frame_interval,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame<'_>,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.last_frame.elapsed() < self.frame_interval {
            return Ok(());
        }
        self.last_frame = Instant::now();
        let width = frame.width();
        let height = frame.height();
        let buffer = frame.buffer().map_err(|e| e.to_string())?;
        let raw = buffer.as_nopadding_buffer(&mut self.scratch);
        let jpeg = self.encoder.encode(raw, width, height).map_err(|e| e.to_string())?;
        publish_video(&self.video, width, height, jpeg);
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> { Ok(()) }
}

type VideoControl = CaptureControl<CaptureHandler, String>;

pub struct NativeCaptureState {
    targets: Mutex<HashMap<String, NativeTarget>>,
    video: Arc<Mutex<VideoShared>>,
    audio: Arc<Mutex<AudioShared>>,
    video_control: Mutex<Option<VideoControl>>,
    monitor_running: Mutex<Option<Arc<AtomicBool>>>,
    audio_running: Mutex<Option<Arc<AtomicBool>>>,
}

impl Default for NativeCaptureState {
    fn default() -> Self {
        Self {
            targets: Mutex::new(HashMap::new()),
            video: Arc::new(Mutex::new(VideoShared::default())),
            audio: Arc::new(Mutex::new(AudioShared::default())),
            video_control: Mutex::new(None),
            monitor_running: Mutex::new(None),
            audio_running: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStartResult {
    ok: bool,
    audio_enabled: bool,
    fps: u32,
    backend: String,
}

fn normalize_fps(fps: Option<u32>) -> u32 {
    match fps.unwrap_or(60) {
        0..=74 => 60,
        75..=104 => 90,
        105..=131 => 120,
        _ => 144,
    }
}

fn interval_for_fps(fps: u32) -> Duration {
    Duration::from_nanos((1_000_000_000u64 / u64::from(fps.max(1))).max(1))
}

fn publish_video(shared: &Arc<Mutex<VideoShared>>, width: u32, height: u32, jpeg: Vec<u8>) {
    if let Ok(mut video) = shared.lock() {
        video.seq = video.seq.wrapping_add(1).max(1);
        video.width = width;
        video.height = height;
        video.jpeg = jpeg;
    }
}

fn capture_settings<T>(item: T, flags: CaptureFlags) -> Settings<CaptureFlags, T>
where
    T: TryInto<GraphicsCaptureItemType>,
{
    Settings::new(
        item,
        CursorCaptureSettings::Default,
        DrawBorderSettings::Default,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    )
}

fn stop_video(state: &NativeCaptureState) {
    if let Ok(mut guard) = state.video_control.lock() {
        if let Some(control) = guard.take() { let _ = control.stop(); }
    }
    if let Ok(mut guard) = state.monitor_running.lock() {
        if let Some(flag) = guard.take() { flag.store(false, Ordering::Release); }
    }
}

fn stop_audio(state: &NativeCaptureState) {
    if let Ok(mut guard) = state.audio_running.lock() {
        if let Some(flag) = guard.take() { flag.store(false, Ordering::Release); }
    }
    if let Ok(mut audio) = state.audio.lock() {
        audio.chunks.clear();
        audio.seq = 0;
    }
}

fn start_dxgi_monitor(
    monitor: Monitor,
    fps: u32,
    shared: Arc<Mutex<VideoShared>>,
) -> Result<Arc<AtomicBool>, String> {
    let running = Arc::new(AtomicBool::new(true));
    let thread_running = running.clone();
    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);

    thread::Builder::new()
        .name("DuoCast DXGI Screen Capture".to_string())
        .spawn(move || {
            let mut duplication = match DxgiDuplicationApi::new_options(monitor, &[DxgiDuplicationFormat::Bgra8]) {
                Ok(v) => v,
                Err(e) => { let _ = ready_tx.send(Err(e.to_string())); return; }
            };
            let encoder = match ImageEncoder::new(ImageFormat::Jpeg, ImageEncoderPixelFormat::Bgra8) {
                Ok(v) => v,
                Err(e) => { let _ = ready_tx.send(Err(e.to_string())); return; }
            };
            let _ = ready_tx.send(Ok(()));
            let mut scratch = Vec::<u8>::new();
            let frame_interval = interval_for_fps(fps);
            let mut last_sent = Instant::now() - Duration::from_secs(1);
            let timeout_ms = ((1000u32 + fps - 1) / fps).clamp(1, 17);

            while thread_running.load(Ordering::Acquire) {
                match duplication.acquire_next_frame(timeout_ms) {
                    Ok(mut frame) => {
                        if last_sent.elapsed() < frame_interval { continue; }
                        last_sent = Instant::now();
                        let width = frame.width();
                        let height = frame.height();
                        let buffer = match frame.buffer() {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        let raw = buffer.as_nopadding_buffer(&mut scratch);
                        if let Ok(jpeg) = encoder.encode(raw, width, height) {
                            publish_video(&shared, width, height, jpeg);
                        }
                    }
                    Err(DxgiError::Timeout) => continue,
                    Err(DxgiError::AccessLost) => break,
                    Err(_) => break,
                }
            }
            thread_running.store(false, Ordering::Release);
        })
        .map_err(|e| e.to_string())?;

    match ready_rx.recv_timeout(Duration::from_secs(4)) {
        Ok(Ok(())) => Ok(running),
        Ok(Err(err)) => { running.store(false, Ordering::Release); Err(err) }
        Err(_) => { running.store(false, Ordering::Release); Err("O motor DXGI demorou demais para iniciar.".to_string()) }
    }
}

fn run_wasapi_loopback(
    shared: Arc<Mutex<AudioShared>>,
    running: Arc<AtomicBool>,
    ready: mpsc::SyncSender<Result<(), String>>,
) -> Result<(), String> {
    initialize_mta().ok().map_err(|e| e.to_string())?;
    let enumerator = match DeviceEnumerator::new() {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    let device = match enumerator.get_default_device(&Direction::Render) {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    let mut audio_client = match device.get_iaudioclient() {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    let desired_format = WaveFormat::new(32, 32, &SampleType::Float, 48_000, 2, None);
    let (_, min_time) = match audio_client.get_device_period() {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    let mode = StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: min_time };
    if let Err(e) = audio_client.initialize_client(&desired_format, &Direction::Capture, &mode) {
        let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg);
    }
    let event = match audio_client.set_get_eventhandle() {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    let capture_client = match audio_client.get_audiocaptureclient() {
        Ok(v) => v,
        Err(e) => { let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg); }
    };
    if let Err(e) = audio_client.start_stream() {
        let msg=e.to_string(); let _=ready.send(Err(msg.clone())); return Err(msg);
    }
    let _ = ready.send(Ok(()));
    let mut bytes = VecDeque::<u8>::new();
    while running.load(Ordering::Acquire) {
        if let Err(e) = capture_client.read_from_device_to_deque(&mut bytes) {
            let _ = audio_client.stop_stream(); return Err(e.to_string());
        }
        let aligned = bytes.len() - (bytes.len() % 8);
        if aligned > 0 {
            let mut raw = Vec::with_capacity(aligned);
            for _ in 0..aligned { if let Some(b)=bytes.pop_front(){ raw.push(b); } }
            let mut samples = Vec::with_capacity(raw.len()/4);
            for chunk in raw.chunks_exact(4) { samples.push(f32::from_le_bytes([chunk[0],chunk[1],chunk[2],chunk[3]])); }
            if !samples.is_empty() {
                if let Ok(mut audio)=shared.lock() {
                    audio.seq=audio.seq.wrapping_add(1).max(1); let seq=audio.seq;
                    audio.chunks.push_back(AudioChunk{seq,samples}); while audio.chunks.len()>120{audio.chunks.pop_front();}
                }
            }
        }
        let _ = event.wait_for_event(100);
    }
    let _ = audio_client.stop_stream();
    wasapi::deinitialize();
    Ok(())
}

fn start_loopback_audio(shared: Arc<Mutex<AudioShared>>) -> Result<Arc<AtomicBool>, String> {
    let running=Arc::new(AtomicBool::new(true)); let thread_running=running.clone();
    let (ready_tx,ready_rx)=mpsc::sync_channel::<Result<(),String>>(1);
    thread::Builder::new().name("DuoCast System Audio".to_string()).spawn(move||{
        let result=run_wasapi_loopback(shared,thread_running.clone(),ready_tx.clone());
        if let Err(err)=result{let _=ready_tx.try_send(Err(err));}
        thread_running.store(false,Ordering::Release);
    }).map_err(|e|e.to_string())?;
    match ready_rx.recv_timeout(Duration::from_secs(3)){
        Ok(Ok(()))=>Ok(running),Ok(Err(err))=>{running.store(false,Ordering::Release);Err(err)},
        Err(_)=>{running.store(false,Ordering::Release);Err("O áudio do sistema demorou demais para iniciar.".to_string())}
    }
}

fn is_browser_process(process: &str) -> bool {
    matches!(process.to_ascii_lowercase().as_str(),
        "chrome.exe"|"msedge.exe"|"brave.exe"|"firefox.exe"|"opera.exe"|"vivaldi.exe")
}

fn should_skip_window(title: &str, process: &str, width: u32, height: u32) -> bool {
    if width < 220 || height < 140 { return true; }
    let t=title.trim().to_ascii_lowercase(); let p=process.trim().to_ascii_lowercase();
    if t.is_empty() || t=="duocast" || t=="program manager" || t.contains("windows input experience") { return true; }
    const SYSTEM_PROCESSES: &[&str]=&[
        "searchhost.exe","startmenuexperiencehost.exe","shellexperiencehost.exe","textinputhost.exe",
        "runtimebroker.exe","lockapp.exe","securityhealthsystray.exe","widgets.exe","dwm.exe","taskhostw.exe",
        "ctfmon.exe","dllhost.exe","fontdrvhost.exe","audiodg.exe"
    ];
    SYSTEM_PROCESSES.contains(&p.as_str())
}

#[tauri::command]
pub fn native_list_sources(state: State<'_, NativeCaptureState>) -> Result<Vec<NativeSource>, String> {
    let mut items=Vec::new();
    let mut targets=state.targets.lock().map_err(|_|"Falha ao acessar as fontes de captura.".to_string())?;
    targets.clear();

    let monitors=Monitor::enumerate().map_err(|e|e.to_string())?;
    for monitor in monitors {
        let index=monitor.index().unwrap_or(items.len()+1); let width=monitor.width().unwrap_or(0); let height=monitor.height().unwrap_or(0);
        let name=monitor.name().unwrap_or_else(|_|format!("Tela {index}")); let id=format!("monitor:{index}");
        targets.insert(id.clone(),NativeTarget::Monitor(monitor));
        items.push(NativeSource{id,kind:"monitor".into(),title:format!("Tela {index}"),subtitle:if width>0&&height>0{format!("{name} · {width} × {height}")}else{name},width,height});
    }

    let windows=Window::enumerate().map_err(|e|e.to_string())?;
    let mut user_windows: Vec<(u8,String,String,u32,u32,Window)>=Vec::new();
    for window in windows {
        if !window.is_valid(){continue;}
        let title=window.title().unwrap_or_default().trim().to_string();
        let width=window.width().unwrap_or(0).max(0) as u32; let height=window.height().unwrap_or(0).max(0) as u32;
        let process=window.process_name().unwrap_or_default();
        if should_skip_window(&title,&process,width,height){continue;}
        let priority=if is_browser_process(&process){0}else{1};
        user_windows.push((priority,title,process,width,height,window));
    }
    user_windows.sort_by(|a,b|a.0.cmp(&b.0).then_with(||a.1.to_ascii_lowercase().cmp(&b.1.to_ascii_lowercase())));
    for (pos,(_,title,process,width,height,window)) in user_windows.into_iter().enumerate(){
        let id=format!("window:{pos}"); targets.insert(id.clone(),NativeTarget::Window(window));
        let subtitle=if process.is_empty(){format!("{width} × {height}")}else if is_browser_process(&process){format!("Navegador · {process} · {width} × {height}")}else{format!("{process} · {width} × {height}")};
        items.push(NativeSource{id,kind:"window".into(),title:title.chars().take(90).collect(),subtitle,width,height});
    }
    Ok(items)
}

#[tauri::command]
pub fn native_start_capture(
    source_id:String,
    with_audio:bool,
    fps:Option<u32>,
    state:State<'_,NativeCaptureState>,
)->Result<NativeStartResult,String>{
    stop_video(&state); stop_audio(&state);
    if let Ok(mut video)=state.video.lock(){*video=VideoShared::default();}
    if let Ok(mut audio)=state.audio.lock(){*audio=AudioShared::default();}
    let target={let targets=state.targets.lock().map_err(|_|"Falha ao acessar a fonte escolhida.".to_string())?;targets.get(&source_id).copied().ok_or_else(||"A fonte escolhida não está mais disponível. Abra o seletor novamente.".to_string())?};
    let fps=normalize_fps(fps);
    let backend=match target{
        NativeTarget::Monitor(monitor)=>{
            let running=start_dxgi_monitor(monitor,fps,state.video.clone())?;
            *state.monitor_running.lock().map_err(|_|"Falha ao manter a captura DXGI.".to_string())?=Some(running);
            "dxgi"
        }
        NativeTarget::Window(window)=>{
            let flags=CaptureFlags{video:state.video.clone(),frame_interval:interval_for_fps(fps)};
            let control=CaptureHandler::start_free_threaded(capture_settings(window,flags)).map_err(|e|e.to_string())?;
            *state.video_control.lock().map_err(|_|"Falha ao iniciar a captura de janela.".to_string())?=Some(control);
            "wgc-window"
        }
    }.to_string();
    let mut audio_enabled=false;
    if with_audio{if let Ok(flag)=start_loopback_audio(state.audio.clone()){
        *state.audio_running.lock().map_err(|_|"Falha ao manter o áudio do sistema.".to_string())?=Some(flag);audio_enabled=true;
    }}
    Ok(NativeStartResult{ok:true,audio_enabled,fps,backend})
}

#[tauri::command]
pub fn native_capture_frame(after_seq:u64,state:State<'_,NativeCaptureState>)->Result<Response,String>{
    let video=state.video.lock().map_err(|_|"Falha ao ler o quadro da captura.".to_string())?;
    if video.seq==0||video.seq<=after_seq||video.jpeg.is_empty(){return Ok(Response::new(Vec::new()));}
    let mut out=Vec::with_capacity(16+video.jpeg.len());out.extend_from_slice(&video.seq.to_le_bytes());out.extend_from_slice(&video.width.to_le_bytes());out.extend_from_slice(&video.height.to_le_bytes());out.extend_from_slice(&video.jpeg);Ok(Response::new(out))
}

#[tauri::command]
pub fn native_capture_audio(after_seq:u64,state:State<'_,NativeCaptureState>)->Result<Response,String>{
    let audio=state.audio.lock().map_err(|_|"Falha ao ler o áudio do sistema.".to_string())?;let mut selected=Vec::new();let mut last_seq=after_seq;
    for chunk in audio.chunks.iter().filter(|chunk|chunk.seq>after_seq).take(24){last_seq=chunk.seq;selected.extend_from_slice(&chunk.samples);}
    if selected.is_empty(){return Ok(Response::new(Vec::new()));}
    let mut out=Vec::with_capacity(16+selected.len()*4);out.extend_from_slice(&last_seq.to_le_bytes());out.extend_from_slice(&audio.sample_rate.to_le_bytes());out.extend_from_slice(&audio.channels.to_le_bytes());for sample in selected{out.extend_from_slice(&sample.to_le_bytes());}Ok(Response::new(out))
}

#[tauri::command]
pub fn native_stop_capture(state:State<'_,NativeCaptureState>)->Result<(),String>{stop_video(&state);stop_audio(&state);Ok(())}
