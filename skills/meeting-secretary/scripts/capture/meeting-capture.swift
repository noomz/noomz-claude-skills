// meeting-capture [--device NAME|default] [--tap-app NAME] [--tap-clock UID]
// Mic (+ optional Core Audio process tap of an app's output, e.g. a Teams call's far end) mixed to
// stdout as signed 16-bit LE, 16 kHz, mono PCM, until SIGTERM/SIGINT or stdout closes.
// ffmpeg's avfoundation input drops ~12% of audio packets on some Macs; an AVAudioEngine tap does not.
// Tap/aggregate-device keys follow insidegui/AudioCap and Apple's "Capturing system audio with Core Audio taps".
import AppKit
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


// ---- Core Audio helpers ----
func caAddr(_ sel: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}
func caArray(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> [AudioObjectID] {
    var a = caAddr(sel); var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(obj, &a, 0, nil, &size) == 0 else { return [] }
    var arr = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(obj, &a, 0, nil, &size, &arr) == 0 else { return [] }
    return arr
}
func caString(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String? {
    var a = caAddr(sel); var s: Unmanaged<CFString>?; var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(obj, &a, 0, nil, &size, &s) == 0, let v = s else { return nil }
    return v.takeRetainedValue() as String
}

// ---- options ----
var device = "default"
var tapApp: String? = nil
var tapClock: String? = nil
let args = CommandLine.arguments
if let i = args.firstIndex(of: "--device"), i + 1 < args.count { device = args[i + 1] }
if let i = args.firstIndex(of: "--tap-app"), i + 1 < args.count { tapApp = args[i + 1] }
if let i = args.firstIndex(of: "--tap-clock"), i + 1 < args.count { tapClock = args[i + 1] }

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

// ---- mixer: one FIFO per source (16 kHz mono Float), summed and clipped to Int16 ----
let micFmt = input.outputFormat(forBus: 0)
let monoFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
let maxLag = 3200  // 200 ms at 16 kHz: more skew than this and one side is emitted alone / dropped
let names = ["mic", "tap"]
let lock = NSLock()
var fifo: [[Float]] = [[], []]
var tapAttached = false
var gaps = [0, 0]
var emitted = [0, 0]      // samples of each source that reached stdout
var lagEvents = [0, 0]    // times a source was emitted alone (mic) / trimmed (tap) because of skew
var sumSq = [0.0, 0.0], cnt = [0, 0]
var peak: [Float] = [0, 0]

func push(_ src: Int, _ p: UnsafePointer<Float>, _ n: Int) {
    lock.lock(); defer { lock.unlock() }
    if src == 1 && !tapAttached { return }
    fifo[src].append(contentsOf: UnsafeBufferPointer(start: p, count: n))
    for k in 0..<n { let v = p[k]; sumSq[src] += Double(v * v); if abs(v) > peak[src] { peak[src] = abs(v) } }
    cnt[src] += n
}

func convertAndPush(_ src: Int, _ conv: AVAudioConverter, _ buf: AVAudioPCMBuffer) {
    let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / buf.format.sampleRate) + 16
    guard let o = AVAudioPCMBuffer(pcmFormat: monoFmt, frameCapacity: cap) else { return }
    var fed = false
    conv.convert(to: o, error: nil) { _, status in
        if fed { status.pointee = .noDataNow; return nil }
        fed = true; status.pointee = .haveData; return buf
    }
    if o.frameLength > 0 { push(src, o.floatChannelData![0], Int(o.frameLength)) }
}

func tick() {
    lock.lock()
    var out: [Float] = []
    if !tapAttached {
        out = fifo[0]; fifo[0] = []; fifo[1] = []
        emitted[0] += out.count
    } else {
        let n = min(fifo[0].count, fifo[1].count)
        out.reserveCapacity(n)
        for k in 0..<n { out.append(fifo[0][k] + fifo[1][k]) }
        fifo[0].removeFirst(n); fifo[1].removeFirst(n)
        emitted[0] += n; emitted[1] += n;
        if fifo[0].count > maxLag {  // tap late: let the mic through alone
            let extra = fifo[0].count - maxLag
            out += fifo[0][0..<extra]; fifo[0].removeFirst(extra)
            emitted[0] += extra; lagEvents[0] += 1
        }
        if fifo[1].count > maxLag {  // mic late: drop the oldest tap audio
            fifo[1].removeFirst(fifo[1].count - maxLag); lagEvents[1] += 1
        }
    }
    lock.unlock()
    if out.isEmpty { return }
    var pcm = [Int16](repeating: 0, count: out.count)
    for k in 0..<out.count { pcm[k] = Int16(max(-32768, min(32767, (out[k] * 32768).rounded()))) }
    pcm.withUnsafeBytes { raw in
        var off = 0
        while off < raw.count {  // raw write: a closed stdout must end us, not throw
            let w = write(1, raw.baseAddress! + off, raw.count - off)
            if w <= 0 { finish() }
            off += w
        }
    }
}

func dbfs(_ s: Double, _ n: Int) -> String {
    if n == 0 || s == 0 { return "-inf" }
    return String(format: "%.1f", 20 * log10((s / Double(n)).squareRoot()))
}
func logLevels() {
    lock.lock()
    var parts: [String] = []
    for s in 0..<(tapApp != nil ? 2 : 1) {
        parts.append("\(names[s]) \(dbfs(sumSq[s], cnt[s])) dBFS (peak \(String(format: "%.2f", peak[s])), \(cnt[s]) samples, \(gaps[s]) gaps, \(lagEvents[s]) lag events)")
        sumSq[s] = 0; cnt[s] = 0; peak[s] = 0
    }
    lock.unlock()
    log("meeting-capture: levels: " + parts.joined(separator: "; "))
}

// ---- process tap ----
final class TapSession {
    var tapID = AudioObjectID(kAudioObjectUnknown), aggID = AudioObjectID(kAudioObjectUnknown)
    var ioProc: AudioDeviceIOProcID?
    var procs: [AudioObjectID]
    var nextTime: Float64 = -1

    init?(procs: [AudioObjectID], clockUID: String) {
        self.procs = procs
        let desc = CATapDescription(stereoMixdownOfProcesses: procs)
        desc.uuid = UUID(); desc.name = "meeting-capture"; desc.isPrivate = true; desc.muteBehavior = .unmuted
        var st = AudioHardwareCreateProcessTap(desc, &tapID)
        if st != 0 { log("meeting-capture: process tap failed, OSStatus \(st) — grant System Audio Recording permission to the terminal app"); return nil }
        var fa = caAddr(kAudioTapPropertyFormat)
        var asbd = AudioStreamBasicDescription(); var fsz = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        st = AudioObjectGetPropertyData(tapID, &fa, 0, nil, &fsz, &asbd)
        guard st == 0, let fmt = AVAudioFormat(streamDescription: &asbd), let conv = AVAudioConverter(from: fmt, to: monoFmt) else {
            log("meeting-capture: tap format unusable (OSStatus \(st))"); stop(); return nil
        }
        conv.downmix = true
        let dict: [String: Any] = [
            kAudioAggregateDeviceNameKey: "meeting-capture-agg",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceMainSubDeviceKey: clockUID,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: clockUID]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: desc.uuid.uuidString]],
        ]
        st = AudioHardwareCreateAggregateDevice(dict as CFDictionary, &aggID)
        if st != 0 { log("meeting-capture: aggregate device failed, OSStatus \(st)"); aggID = AudioObjectID(kAudioObjectUnknown); stop(); return nil }
        let q = DispatchQueue(label: "meeting-capture.tap", qos: .userInteractive)
        st = AudioDeviceCreateIOProcIDWithBlock(&ioProc, aggID, q) { [weak self] _, inData, inTime, _, _ in
            guard let self = self, let buf = AVAudioPCMBuffer(pcmFormat: fmt, bufferListNoCopy: inData, deallocator: nil) else { return }
            if self.nextTime >= 0 && inTime.pointee.mSampleTime != self.nextTime { lock.lock(); gaps[1] += 1; lock.unlock() }
            self.nextTime = inTime.pointee.mSampleTime + Float64(buf.frameLength)
            convertAndPush(1, conv, buf)
        }
        if st != 0 { log("meeting-capture: tap IOProc failed, OSStatus \(st)"); ioProc = nil; stop(); return nil }
        st = AudioDeviceStart(aggID, ioProc)
        if st != 0 { log("meeting-capture: tap start failed, OSStatus \(st)"); stop(); return nil }
    }

    func stop() {
        if aggID != kAudioObjectUnknown {
            if let p = ioProc { AudioDeviceStop(aggID, p); AudioDeviceDestroyIOProcID(aggID, p); ioProc = nil }
            AudioHardwareDestroyAggregateDevice(aggID); aggID = AudioObjectID(kAudioObjectUnknown)
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID); tapID = AudioObjectID(kAudioObjectUnknown) }
    }
}

var tapSession: TapSession? = nil  // touched on the main queue only, plus finish()
var lastTapState = ""

// An exact app name or bundle id wins; a substring match ("Line" also hits "Outline") is the
// fallback only. Returns the matched apps too, so the log shows exactly what is recorded.
func tapProcesses(_ name: String) -> (procs: [AudioObjectID], apps: [String]) {
    let running = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier != nil }
    let exact = running.filter {
        ($0.localizedName ?? "").caseInsensitiveCompare(name) == .orderedSame || $0.bundleIdentifier == name
    }
    let matched = exact.isEmpty ? running.filter { ($0.localizedName ?? "").localizedCaseInsensitiveContains(name) } : exact
    let bundles = Set(matched.compactMap { $0.bundleIdentifier })
    if bundles.isEmpty { return ([], []) }
    let procs = caArray(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList).filter { o in
        guard let b = caString(o, kAudioProcessPropertyBundleID) else { return false }
        return bundles.contains { b.hasPrefix($0) }
    }.sorted()
    return (procs, matched.map { "\($0.localizedName ?? "?") (\($0.bundleIdentifier!))" }.sorted())
}

func clockUID() -> String? {
    if let c = tapClock { return c }
    let all = caArray(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices)
    if let d = all.first(where: { caString($0, kAudioDevicePropertyDeviceUID) == "BuiltInSpeakerDevice" }) { return caString(d, kAudioDevicePropertyDeviceUID) }
    var a = caAddr(kAudioHardwarePropertyDefaultOutputDevice)
    var dev = AudioObjectID(0); var sz = UInt32(MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &sz, &dev)
    return caString(dev, kAudioDevicePropertyDeviceUID)
}

func setTapState(_ s: String) { if s != lastTapState { lastTapState = s; log("meeting-capture: " + s) } }

func scanTap() {
    guard let name = tapApp else { return }
    let (procs, apps) = tapProcesses(name)
    if let t = tapSession, t.procs == procs { return }
    if let t = tapSession {  // process set changed (or gone): drop the old tap
        lock.lock(); tapAttached = false; fifo[1] = []; lock.unlock()
        t.stop(); tapSession = nil
    }
    if procs.isEmpty {
        setTapState("WARNING: no running audio process matches --tap-app '\(name)'; mic only, rescanning every 10 s")
        return
    }
    guard let uid = clockUID() else { setTapState("WARNING: no output device for the tap clock; mic only"); return }
    if let t = TapSession(procs: procs, clockUID: uid) {
        tapSession = t
        lock.lock(); tapAttached = true; lock.unlock()
        lastTapState = ""
        log("meeting-capture: tapping '\(name)': \(apps.joined(separator: ", ")); \(procs.count) process object(s), clock '\(uid)', unmuted")
    } else {
        setTapState("WARNING: tap for '\(name)' could not start; mic only, retrying every 10 s")
    }
}

// ---- mic ----
guard let micConv = AVAudioConverter(from: micFmt, to: monoFmt) else { log("meeting-capture: no converter from \(micFmt)"); exit(1) }
micConv.downmix = true  // default keeps channel 1 only; an aggregate mic+loopback has the far end on channel 2
var micNext: AVAudioFramePosition = -1
var micFrames: AVAudioFramePosition = 0

signal(SIGPIPE, SIG_IGN)
input.installTap(onBus: 0, bufferSize: 4096, format: micFmt) { buf, when in
    if micNext >= 0 && when.sampleTime != micNext { lock.lock(); gaps[0] += 1; lock.unlock() }
    micNext = when.sampleTime + AVAudioFramePosition(buf.frameLength)
    micFrames += AVAudioFramePosition(buf.frameLength)
    convertAndPush(0, micConv, buf)
}

let finishLock = NSLock()
func finish() -> Never {
    finishLock.lock()  // never unlocked: the first caller exits the process
    tapSession?.stop(); tapSession = nil
    engine.stop()
    lock.lock()
    let msg = "meeting-capture: stopped, \(String(format: "%.1f", Double(micFrames) / micFmt.sampleRate)) s mic input, mic \(gaps[0]) gaps \(emitted[0]) samples out, tap \(gaps[1]) gaps \(emitted[1]) samples out"
    lock.unlock()
    log(msg)
    exit(0)
}

var sources: [DispatchSourceSignal] = []
var keepAlive: [Any] = []
for s in [SIGTERM, SIGINT] {
    signal(s, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: s, queue: .main)
    src.setEventHandler { finish() }
    src.resume()
    sources.append(src)
}

NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { _ in
    log("meeting-capture: audio configuration changed (input device switched?) — exiting")
    tapSession?.stop(); tapSession = nil
    exit(3)
}

do { try engine.start() } catch { log("meeting-capture: engine start failed: \(error)"); exit(1) }
log("meeting-capture: capturing '\(device)' \(micFmt.sampleRate) Hz x\(micFmt.channelCount)" + (tapApp.map { ", tap-app '\($0)'" } ?? ""))

let mixQ = DispatchQueue(label: "meeting-capture.mix", qos: .userInteractive)
let mixTimer = DispatchSource.makeTimerSource(queue: mixQ)
mixTimer.schedule(deadline: .now() + .milliseconds(20), repeating: .milliseconds(20))
mixTimer.setEventHandler { tick() }
mixTimer.resume()

let levelTimer = DispatchSource.makeTimerSource(queue: .main)
levelTimer.schedule(deadline: .now() + 30, repeating: 30)
levelTimer.setEventHandler { logLevels() }
levelTimer.resume()

if tapApp != nil {
    scanTap()
    let scanTimer = DispatchSource.makeTimerSource(queue: .main)
    scanTimer.schedule(deadline: .now() + 10, repeating: 10)
    scanTimer.setEventHandler { scanTap() }
    scanTimer.resume()
    keepAlive.append(scanTimer)
}
dispatchMain()
