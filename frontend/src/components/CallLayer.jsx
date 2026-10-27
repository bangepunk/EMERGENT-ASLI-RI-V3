import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, PhoneIncoming, Users } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useApp } from "../context/AppContext";
import { Avatar } from "./common";

const CallCtx = createContext(null);
export const useCall = () => useContext(CallCtx);
const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

function Tile({ stream, user, muted, self }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = stream?.getVideoTracks().some((t) => t.enabled);
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-[#0d1220]" data-testid={self ? "call-tile-self" : "call-tile-remote"}>
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${hasVideo ? "" : "hidden"} ${self ? "-scale-x-100" : ""}`} />
      {!hasVideo && <Avatar user={user} size={64} showStatus={false} />}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">{self ? "You" : user?.name}</span>
    </div>
  );
}

export function CallProvider({ children }) {
  const { me, userMap, subscribe, send } = useApp();
  const [call, setCall] = useState(null);
  const [ringing, setRinging] = useState(null);
  const [remotes, setRemotes] = useState({});
  const [local, setLocal] = useState(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [secs, setSecs] = useState(0);
  const peers = useRef({});
  const callRef = useRef(null);
  const localRef = useRef(null);
  const timeout = useRef(null);

  const cleanup = useCallback(() => {
    Object.values(peers.current).forEach((p) => p.close());
    peers.current = {};
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    callRef.current = null;
    clearTimeout(timeout.current);
    setLocal(null);
    setRemotes({});
    setCall(null);
    setSecs(0);
  }, []);

  const peerFor = useCallback((uid) => {
    if (peers.current[uid]) return peers.current[uid];
    const pc = new RTCPeerConnection(ICE);
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
    pc.onicecandidate = (e) => e.candidate && send({ type: "signal", to: uid, call_id: callRef.current?.id, signal: { ice: e.candidate } });
    pc.ontrack = (e) => setRemotes((r) => ({ ...r, [uid]: e.streams[0] }));
    peers.current[uid] = pc;
    return pc;
  }, [send]);

  const getMedia = async (media) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" });
      localRef.current = s;
      setLocal(s);
      setCam(media === "video");
      setMic(true);
      return true;
    } catch {
      toast.error("Microphone/camera access was blocked. Allow access in your browser to join calls.");
      return false;
    }
  };

  const join = useCallback(async (c) => {
    if (!(await getMedia(c.media))) return false;
    const { data } = await api.post(`/calls/${c.id}/join`);
    callRef.current = data;
    setCall(data);
    for (const uid of data.participants.filter((x) => x !== me.user_id)) {
      const pc = peerFor(uid);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "signal", to: uid, call_id: data.id, signal: { sdp: pc.localDescription } });
    }
    return true;
  }, [me, peerFor, send]);

  const startCall = async (conversationId, media) => {
    if (callRef.current) return toast.error("You are already in a call");
    try {
      const { data } = await api.post("/calls", { conversation_id: conversationId, media });
      const ok = await join(data);
      if (ok && !data.is_group) {
        timeout.current = setTimeout(() => {
          if (callRef.current && Object.keys(peers.current).length === 0) leave(false);
        }, 35000);
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const leave = async (endAll) => {
    const c = callRef.current;
    cleanup();
    if (c) await api.post(`/calls/${c.id}/leave`, { end_for_all: !!endAll }).catch(() => {});
  };

  useEffect(() => subscribe(async (evt) => {
    const d = evt.data;
    if (evt.type === "call:ring" && !callRef.current) setRinging(d);
    if (evt.type === "call:ended") {
      setRinging((r) => (r?.id === d.call_id ? null : r));
      if (callRef.current?.id === d.call_id) cleanup();
    }
    if (!callRef.current || d?.call_id !== callRef.current.id) return;
    if (evt.type === "call:joined") clearTimeout(timeout.current);
    if (evt.type === "call:left" || evt.type === "call:declined") {
      peers.current[d.user_id]?.close();
      delete peers.current[d.user_id];
      setRemotes((r) => { const n = { ...r }; delete n[d.user_id]; return n; });
    }
    if (evt.type === "signal") {
      const pc = peerFor(d.from);
      const s = d.signal;
      if (s.sdp) {
        await pc.setRemoteDescription(s.sdp);
        if (s.sdp.type === "offer") {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          send({ type: "signal", to: d.from, call_id: d.call_id, signal: { sdp: pc.localDescription } });
        }
      } else if (s.ice) {
        await pc.addIceCandidate(s.ice).catch(() => {});
      }
    }
  }), [subscribe, cleanup, peerFor, send]);

  useEffect(() => {
    if (!call) return undefined;
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [call]);

  const toggleMic = () => { localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !mic)); setMic(!mic); };
  const toggleCam = async () => {
    const vt = localRef.current?.getVideoTracks() || [];
    if (!vt.length) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = s.getVideoTracks()[0];
        localRef.current.addTrack(track);
        for (const [uid, pc] of Object.entries(peers.current)) {
          pc.addTrack(track, localRef.current);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "signal", to: uid, call_id: callRef.current.id, signal: { sdp: pc.localDescription } });
        }
        setLocal(new MediaStream(localRef.current.getTracks()));
        setCam(true);
      } catch { toast.error("Camera unavailable"); }
      return;
    }
    vt.forEach((t) => (t.enabled = !cam));
    setCam(!cam);
    setLocal(new MediaStream(localRef.current.getTracks()));
  };

  const accept = async () => { const r = ringing; setRinging(null); await join(r).catch((e) => toast.error(errMsg(e))); };
  const decline = async () => { const r = ringing; setRinging(null); await api.post(`/calls/${r.id}/decline`).catch(() => {}); };
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const remoteIds = Object.keys(remotes);

  return (
    <CallCtx.Provider value={{ startCall, inCall: !!call, join }}>
      {children}
      {ringing && (
        <div className="fixed left-1/2 top-4 z-[90] w-[92vw] max-w-sm -translate-x-1/2 card p-4 animate-rise" data-testid="incoming-call">
          <div className="flex items-center gap-3">
            <Avatar user={userMap[ringing.started_by]} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-sub flex items-center gap-1"><PhoneIncoming size={12} /> Incoming {ringing.media} call</p>
              <p className="truncate font-semibold">{ringing.caller_name}{ringing.conversation_name ? ` · ${ringing.conversation_name}` : ""}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={decline} className="h-11 rounded-full bg-rose-500 font-semibold text-white" data-testid="decline-call-btn">Decline</button>
            <button onClick={accept} className="h-11 rounded-full bg-emerald-500 font-semibold text-white flex items-center justify-center gap-2" data-testid="accept-call-btn"><Phone size={16} />Accept</button>
          </div>
        </div>
      )}
      {call && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f1a]/95 p-3 text-white sm:p-6 pt-safe pb-safe" data-testid="call-overlay">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{call.media === "video" ? "Video" : "Voice"} call</p>
              <p className="text-xs text-white/60 flex items-center gap-1" data-testid="call-duration"><Users size={12} /> {remoteIds.length + 1} in call · {mmss}</p>
            </div>
          </div>
          <div className={`my-4 grid flex-1 content-center gap-3 overflow-auto ${remoteIds.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Tile stream={local} user={me} muted self />
            {remoteIds.map((id) => <Tile key={id} stream={remotes[id]} user={userMap[id]} />)}
            {!remoteIds.length && <div className="flex aspect-video items-center justify-center rounded-2xl border border-white/10 text-sm text-white/60">Waiting for others to join…</div>}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={toggleMic} className={`h-14 w-14 rounded-full flex items-center justify-center ${mic ? "bg-white/15" : "bg-white text-[#0b0f1a]"}`} data-testid="call-mic-toggle" aria-label="Toggle microphone">{mic ? <Mic /> : <MicOff />}</button>
            <button onClick={toggleCam} className={`h-14 w-14 rounded-full flex items-center justify-center ${cam ? "bg-white/15" : "bg-white text-[#0b0f1a]"}`} data-testid="call-camera-toggle" aria-label="Toggle camera">{cam ? <Video /> : <VideoOff />}</button>
            <button onClick={() => leave(false)} className="h-14 rounded-full bg-rose-500 px-6 flex items-center gap-2 font-semibold" data-testid="call-leave-btn"><PhoneOff size={18} />Leave</button>
            {call.is_group && (call.started_by === me.user_id) && <button onClick={() => leave(true)} className="h-14 rounded-full border border-rose-400 px-4 text-sm text-rose-300" data-testid="call-end-all-btn">End for all</button>}
          </div>
        </div>
      )}
    </CallCtx.Provider>
  );
}
