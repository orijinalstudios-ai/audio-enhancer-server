// @ts-nocheck
// ============================================================
// 🎵 AI AUDIO ENHANCER — Final Version
// ============================================================

import { useState, useEffect, useRef } from "react";
import {
  View, Text, Switch, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, SafeAreaView,
  Animated, Dimensions,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

const SCREEN_WIDTH = Dimensions.get("window").width;
const BAR_COUNT    = 60;
const BAR_WIDTH    = (SCREEN_WIDTH - 64) / BAR_COUNT - 1.5;

// ⚠️ Replace this with your actual Render URL
const SERVER_URL = "https://audio-enhancer-server.onrender.com";


// ============================================================
// 🔧 WAVEFORM HELPERS
// ============================================================

const generateOriginalWaveform = () =>
  Array.from({ length: BAR_COUNT }, () => Math.random() * 0.7 + 0.15);

const generateEnhancedWaveform = (original) =>
  original.map((val, i) => {
    const prev = original[i - 1] ?? val;
    const next = original[i + 1] ?? val;
    return ((prev + val + next) / 3) * 0.75 + 0.15;
  });


// ============================================================
// 🌊 WAVEFORM COMPONENT
// ============================================================

function WaveformVisualizer({ bars, isPlaying, color }) {
  const animatedBars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(1))
  ).current;
  const playheadX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPlaying) {
      Animated.timing(playheadX, {
        toValue: SCREEN_WIDTH - 64,
        duration: 10000,
        useNativeDriver: false,
      }).start();

      const pulses = animatedBars.map((bar) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, { toValue: 1 + Math.random() * 0.5, duration: 200 + Math.random() * 300, useNativeDriver: true }),
            Animated.timing(bar, { toValue: 0.7 + Math.random() * 0.3, duration: 200 + Math.random() * 300, useNativeDriver: true }),
          ])
        )
      );
      Animated.parallel(pulses).start();
      return () => {
        pulses.forEach((a) => a.stop());
        animatedBars.forEach((b) => b.setValue(1));
        playheadX.setValue(0);
      };
    } else {
      playheadX.setValue(0);
      animatedBars.forEach((b) => b.setValue(1));
    }
  }, [isPlaying]);

  useEffect(() => {
    animatedBars.forEach((b) => b.setValue(1));
    playheadX.setValue(0);
  }, [bars]);

  return (
    <View style={styles.waveformContainer}>
      <View style={styles.waveformBars}>
        {bars.map((height, i) => (
          <Animated.View
            key={i}
            style={[styles.bar, {
              height: height * 80,
              backgroundColor: color,
              width: BAR_WIDTH,
              transform: [{ scaleY: animatedBars[i] }],
              opacity: 0.75 + height * 0.25,
            }]}
          />
        ))}
      </View>
      {isPlaying && (
        <Animated.View style={[styles.playhead, { left: playheadX }]} />
      )}
    </View>
  );
}


// ============================================================
// 🎵 MAIN APP
// ============================================================

export default function App() {

  const [serverStatus, setServerStatus] = useState("unknown");
  const [audioFile, setAudioFile]       = useState(null);
  const [enhancedUri, setEnhancedUri]   = useState(null);
  const [isEnhanced, setIsEnhanced]     = useState(false);
  const [isEnhancing, setIsEnhancing]   = useState(false);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [sound, setSound]               = useState(null);
  const [nowPlaying, setNowPlaying]     = useState("");
  const [waveformMode, setWaveformMode] = useState("original");
  const [originalBars, setOriginalBars] = useState([]);
  const [enhancedBars, setEnhancedBars] = useState([]);
  const [noiseRemoval, setNoiseRemoval] = useState(true);
  const [voiceClarity, setVoiceClarity] = useState(true);
  const [bassBoost, setBassBoost]       = useState(false);
  const [trebleBoost, setTrebleBoost]   = useState(false);


  // ── Auto-connect when app opens ──────────────────────────
  // ✅ testConnection is defined BEFORE useEffect calls it
  const testConnection = async () => {
    try {
      setServerStatus("unknown");
      const res  = await fetch(`${SERVER_URL}/health`);
      const data = await res.json();
      if (data.status === "ok") {
        setServerStatus("ok");
      } else {
        setServerStatus("error");
      }
    } catch (e) {
      setServerStatus("error");
    }
  };

  // Runs once when the app first opens
  useEffect(() => {
    testConnection();
  }, []);


  // ── Pick audio file ──────────────────────────────────────
  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        await stopPlayback();
        setAudioFile(result.assets[0]);
        setIsEnhanced(false);
        setEnhancedUri(null);
        setWaveformMode("original");
        setOriginalBars(generateOriginalWaveform());
        setEnhancedBars([]);
        Alert.alert("✅ File Loaded", `Loaded: ${result.assets[0].name}`);
      }
    } catch (e) {
      Alert.alert("Error", "Could not load file.");
    }
  };


  // ── Enhance audio ────────────────────────────────────────
  const enhanceAudio = async () => {
    if (!audioFile) {
      Alert.alert("No File", "Please load an audio file first!");
      return;
    }
    if (serverStatus !== "ok") {
      Alert.alert("Server Offline", "The server is not reachable. Please try again later.");
      return;
    }

    setIsEnhancing(true);

    try {
      const formData = new FormData();
      formData.append("audio", {
        uri: audioFile.uri,
        name: audioFile.name,
        type: "audio/wav",
      });
      formData.append("noiseRemoval", noiseRemoval.toString());
      formData.append("voiceClarity", voiceClarity.toString());
      formData.append("bassBoost",    bassBoost.toString());
      formData.append("trebleBoost",  trebleBoost.toString());

      const response = await fetch(`${SERVER_URL}/enhance`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const outputPath = FileSystem.cacheDirectory + "enhanced.wav";
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];
        await FileSystem.writeAsStringAsync(outputPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setEnhancedUri(outputPath);
        setEnhancedBars(generateEnhancedWaveform(originalBars));
        setIsEnhanced(true);
        setWaveformMode("enhanced");
        setIsEnhancing(false);
        Alert.alert("✅ Enhancement Complete!", "Tap the buttons to compare before & after.");
      };
      reader.readAsDataURL(blob);

    } catch (e) {
      Alert.alert("❌ Enhancement Failed", `Error: ${e.message}`);
      setIsEnhancing(false);
    }
  };


  // ── Play audio ───────────────────────────────────────────
  const playAudio = async (type) => {
    const uri = type === "enhanced" ? enhancedUri : audioFile?.uri;
    if (!uri) return;
    try {
      await stopPlayback();
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);
      setWaveformMode(type);
      setNowPlaying(type === "original" ? "🔵 Playing: Original" : "🟢 Playing: Enhanced");
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          setNowPlaying("");
        }
      });
    } catch (e) {
      Alert.alert("Error", "Could not play audio.");
      setIsPlaying(false);
    }
  };


  // ── Stop playback ────────────────────────────────────────
  const stopPlayback = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
    setNowPlaying("");
  };


  // ── Save file ────────────────────────────────────────────
  const saveFile = async () => {
    if (!isEnhanced || !enhancedUri) {
      Alert.alert("Not Enhanced", "Please enhance the audio first!");
      return;
    }
    try {
      const dest = FileSystem.documentDirectory + "enhanced_audio.wav";
      await FileSystem.copyAsync({ from: enhancedUri, to: dest });
      Alert.alert("💾 Saved!", "Enhanced audio saved to your app folder!");
    } catch (e) {
      Alert.alert("Error", "Could not save file.");
    }
  };


  const activeBars = waveformMode === "enhanced" && enhancedBars.length > 0
    ? enhancedBars : originalBars;
  const waveColor  = waveformMode === "enhanced" ? "#4ade80" : "#60a5fa";

  const statusColor =
    serverStatus === "ok"    ? "#4ade80" :
    serverStatus === "error" ? "#f87171" : "#f59e0b";

  const statusText =
    serverStatus === "ok"    ? "✅ Server Connected" :
    serverStatus === "error" ? "❌ Server Offline" : "⏳ Connecting...";


  // ============================================================
  // 🖥️ SCREEN
  // ============================================================

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.title}>🎵 GLC AI Audio Enhancer</Text>
        <Text style={styles.subtitle}>Load a file, enhance it, compare before & after</Text>

        {/* ── Small server status badge (no URL input needed!) ── */}
        <View style={styles.connectionBadge}>
          <Text style={[styles.connectionText, { color: statusColor }]}>
            {statusText}
          </Text>
          {/* Retry button shown only if server is offline */}
          {serverStatus === "error" && (
            <TouchableOpacity onPress={testConnection} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Load File ── */}
        <TouchableOpacity style={styles.loadBtn} onPress={pickAudioFile}>
          <Text style={styles.loadBtnText}>📂  Load Audio File</Text>
        </TouchableOpacity>

        {audioFile && <Text style={styles.fileName}>✅ {audioFile.name}</Text>}

        {/* ── Waveform ── */}
        {originalBars.length > 0 && (
          <View style={styles.waveformSection}>
            <Text style={styles.waveformLabel}>
              {waveformMode === "enhanced" ? "🟢 Enhanced Waveform" : "🔵 Original Waveform"}
            </Text>
            <WaveformVisualizer bars={activeBars} isPlaying={isPlaying} color={waveColor} />
            <View style={styles.waveformToggleRow}>
              <TouchableOpacity
                style={[styles.waveToggleBtn, waveformMode === "original" && styles.waveToggleActiveBlue]}
                onPress={() => setWaveformMode("original")}
              >
                <Text style={styles.waveToggleText}>Original</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.waveToggleBtn, waveformMode === "enhanced" && styles.waveToggleActiveGreen, !isEnhanced && styles.disabledBtn]}
                onPress={() => isEnhanced && setWaveformMode("enhanced")}
              >
                <Text style={styles.waveToggleText}>Enhanced</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Enhancement Toggles ── */}
        <Text style={styles.sectionTitle}>Choose Enhancements:</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🔇 Remove Background Noise</Text>
            <Switch value={noiseRemoval} onValueChange={setNoiseRemoval} trackColor={{ true: "#1f6aa5" }} thumbColor={noiseRemoval ? "#fff" : "#ccc"} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🎤 Improve Voice Clarity</Text>
            <Switch value={voiceClarity} onValueChange={setVoiceClarity} trackColor={{ true: "#1f6aa5" }} thumbColor={voiceClarity ? "#fff" : "#ccc"} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🔊 Boost Bass</Text>
            <Switch value={bassBoost} onValueChange={setBassBoost} trackColor={{ true: "#1f6aa5" }} thumbColor={bassBoost ? "#fff" : "#ccc"} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>✨ Boost Treble</Text>
            <Switch value={trebleBoost} onValueChange={setTrebleBoost} trackColor={{ true: "#1f6aa5" }} thumbColor={trebleBoost ? "#fff" : "#ccc"} />
          </View>
        </View>

        {/* ── Enhance Button ── */}
        <TouchableOpacity
          style={[styles.enhanceBtn, !audioFile && styles.disabledBtn]}
          onPress={enhanceAudio}
          disabled={!audioFile || isEnhancing}
        >
          {isEnhancing
            ? <><ActivityIndicator color="#fff" /><Text style={[styles.enhanceBtnText, { marginLeft: 10 }]}>Processing on server...</Text></>
            : <Text style={styles.enhanceBtnText}>⚡  Enhance Audio</Text>
          }
        </TouchableOpacity>

        {/* ── Playback ── */}
        <Text style={styles.sectionTitle}>🎧 Before & After Playback:</Text>
        <View style={styles.playbackRow}>
          <TouchableOpacity
            style={[styles.playBtn, styles.playOriginalBtn, !audioFile && styles.disabledBtn]}
            onPress={() => playAudio("original")}
            disabled={!audioFile || isPlaying}
          >
            <Text style={styles.playBtnText}>▶  Original</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.playBtn, styles.playEnhancedBtn, !isEnhanced && styles.disabledBtn]}
            onPress={() => playAudio("enhanced")}
            disabled={!isEnhanced || isPlaying}
          >
            <Text style={styles.playBtnText}>▶  Enhanced</Text>
          </TouchableOpacity>
        </View>

        {isPlaying && (
          <TouchableOpacity style={styles.stopBtn} onPress={stopPlayback}>
            <Text style={styles.stopBtnText}>⏹  Stop Playback</Text>
          </TouchableOpacity>
        )}

        {nowPlaying !== "" && <Text style={styles.nowPlaying}>{nowPlaying}</Text>}

        {/* ── Save ── */}
        <TouchableOpacity
          style={[styles.saveBtn, !isEnhanced && styles.disabledBtn]}
          onPress={saveFile}
          disabled={!isEnhanced}
        >
          <Text style={styles.saveBtnText}>💾  Save Enhanced Audio</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}


// ============================================================
// 🎨 STYLES
// ============================================================

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: "#1a1a2e" },
  container: { padding: 24, alignItems: "center" },
  title:     { fontSize: 28, fontWeight: "bold", color: "#fff", marginTop: 20, marginBottom: 6 },
  subtitle:  { fontSize: 14, color: "#888", marginBottom: 16, textAlign: "center" },

  // ── Connection badge ──
  connectionBadge: {
    width: "100%", flexDirection: "row", alignItems: "center",
    justifyContent: "center", backgroundColor: "#16213e",
    borderRadius: 10, padding: 10, marginBottom: 16, gap: 10,
  },
  connectionText: { fontSize: 13, fontWeight: "600" },
  retryBtn: { backgroundColor: "#1f6aa5", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6 },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  loadBtn:     { backgroundColor: "#1f6aa5", paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center", marginBottom: 10 },
  loadBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  fileName:    { color: "#4ade80", fontSize: 13, marginBottom: 16 },

  // ── Waveform ──
  waveformSection:   { width: "100%", backgroundColor: "#0f0f1f", borderRadius: 16, padding: 16, marginBottom: 20, alignItems: "center" },
  waveformLabel:     { color: "#aaa", fontSize: 13, marginBottom: 12, fontWeight: "600" },
  waveformContainer: { width: "100%", height: 90, justifyContent: "center", position: "relative" },
  waveformBars:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 80 },
  bar:               { borderRadius: 3 },
  playhead:          { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#ffffff88", borderRadius: 1 },
  waveformToggleRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  waveToggleBtn:          { paddingVertical: 6, paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#2a2a4a" },
  waveToggleActiveBlue:   { backgroundColor: "#1f6aa5" },
  waveToggleActiveGreen:  { backgroundColor: "#2d6a4f" },
  waveToggleText:         { color: "#fff", fontSize: 13, fontWeight: "600" },

  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "bold", alignSelf: "flex-start", marginBottom: 10, marginTop: 10 },
  card:         { backgroundColor: "#16213e", borderRadius: 16, padding: 16, width: "100%", marginBottom: 20 },
  toggleRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  toggleLabel:  { color: "#fff", fontSize: 15 },
  divider:      { height: 1, backgroundColor: "#2a2a4a" },

  enhanceBtn:     { backgroundColor: "#1f6aa5", paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center", marginBottom: 20, flexDirection: "row", justifyContent: "center" },
  enhanceBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  playbackRow:     { flexDirection: "row", justifyContent: "space-between", width: "100%", marginBottom: 12, gap: 12 },
  playBtn:         { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  playOriginalBtn: { backgroundColor: "#555" },
  playEnhancedBtn: { backgroundColor: "#2d6a4f" },
  playBtnText:     { color: "#fff", fontSize: 15, fontWeight: "600" },

  stopBtn:     { backgroundColor: "#8b1a1a", paddingVertical: 12, borderRadius: 12, width: "100%", alignItems: "center", marginBottom: 8 },
  stopBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  nowPlaying:  { color: "#aaa", fontSize: 13, marginBottom: 16 },

  saveBtn:     { backgroundColor: "#2d8a4e", paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center", marginTop: 8, marginBottom: 40 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  disabledBtn: { opacity: 0.4 },
});