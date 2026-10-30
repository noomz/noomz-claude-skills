// meeting-capture [--device NAME|default]
// Mic -> stdout as signed 16-bit LE, 16 kHz, mono PCM, until SIGTERM/SIGINT or stdout closes.
// ffmpeg's avfoundation input drops ~12% of audio packets on some Macs; an AVAudioEngine tap does not.
import AVFoundation
import CoreAudio
import Foundation

func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

func inputDevices() -> [(id: AudioDeviceID, name: String)] {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == 0 else { return [] }
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == 0 else { return [] }
    var found: [(AudioDeviceID, String)] = []
    for id in ids {
        var sAddr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioObjectPropertyScopeInput, mElement: kAudioObjectPropertyElementMain)
        var sSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &sAddr, 0, nil, &sSize) == 0, sSize > 0 else { continue }
        var nAddr = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var name: Unmanaged<CFString>?
        var nSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &nAddr, 0, nil, &nSize, &name) == 0, let n = name else { continue }
        found.append((id, n.takeRetainedValue() as String))
    }
    return found
}

var device = "default"
let args = CommandLine.arguments
if let i = args.firstIndex(of: "--device"), i + 1 < args.count { device = args[i + 1] }

let engine = AVAudioEngine()
let input = engine.inputNode

if device != "default" {
    let devs = inputDevices()
    guard let au = input.audioUnit, let match = devs.first(where: { $0.name == device }) else {
        log("meeting-capture: unknown input device '\(device)'. Input devices: " + inputDevices().map { "'\($0.name)'" }.joined(separator: ", "))
        exit(2)
    }
    var id = match.id
    let st = AudioUnitSetProperty(au, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
                                  &id, UInt32(MemoryLayout<AudioDeviceID>.size))
    if st != 0 { log("meeting-capture: cannot select '\(device)' (OSStatus \(st))"); exit(2) }
}

let inFmt = input.outputFormat(forBus: 0)
let outFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
guard let conv = AVAudioConverter(from: inFmt, to: outFmt) else { log("meeting-capture: no converter from \(inFmt)"); exit(1) }
conv.downmix = true  // default keeps channel 1 only; an aggregate mic+loopback has the far end on channel 2
let out = FileHandle.standardOutput
var nextTime: AVAudioFramePosition = -1
var gaps = 0
var frames: AVAudioFramePosition = 0

signal(SIGPIPE, SIG_IGN)
input.installTap(onBus: 0, bufferSize: 4096, format: inFmt) { buf, when in
    if nextTime >= 0 && when.sampleTime != nextTime { gaps += 1 }
    nextTime = when.sampleTime + AVAudioFramePosition(buf.frameLength)
    frames += AVAudioFramePosition(buf.frameLength)
    let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / inFmt.sampleRate) + 16
    guard let o = AVAudioPCMBuffer(pcmFormat: outFmt, frameCapacity: cap) else { return }
    var fed = false
    conv.convert(to: o, error: nil) { _, status in
        if fed { status.pointee = .noDataNow; return nil }
        fed = true; status.pointee = .haveData; return buf
    }
    let bytes = Int(o.frameLength) * 2
    var off = 0
    let p = UnsafeRawPointer(o.int16ChannelData![0])
    while off < bytes {  // raw write: a closed stdout must end us, not throw
        let n = write(1, p + off, bytes - off)
        if n <= 0 { finish() }
        off += n
    }
}

func finish() -> Never {
    engine.stop()
    log("meeting-capture: stopped, \(String(format: "%.1f", Double(frames) / inFmt.sampleRate)) s input, \(gaps) gaps")
    exit(0)
}

var sources: [DispatchSourceSignal] = []
for s in [SIGTERM, SIGINT] {
    signal(s, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: s, queue: .main)
    src.setEventHandler { finish() }
    src.resume()
    sources.append(src)
}

NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { _ in
    log("meeting-capture: audio configuration changed (input device switched?) — exiting")
    exit(3)
}

do { try engine.start() } catch { log("meeting-capture: engine start failed: \(error)"); exit(1) }
log("meeting-capture: capturing '\(device)' \(inFmt.sampleRate) Hz x\(inFmt.channelCount)")
dispatchMain()
