# ============================================================
# 🎵 AI AUDIO ENHANCER — Python Backend Server
# ============================================================
# This server receives audio from your phone, enhances it,
# and sends it back. Run this on your PC while using the app.
#
# Install requirements:
#   pip install flask flask-cors noisereduce scipy numpy soundfile
#
# Then run with:
#   python server.py
# ============================================================

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import numpy as np
import soundfile as sf
import noisereduce as nr
from scipy.signal import butter, lfilter
import os
import tempfile

app = Flask(__name__)
CORS(app)  # Allows your phone to talk to this server


# ============================================================
# 🔧 AUDIO PROCESSING FUNCTIONS
# (Same as your desktop app!)
# ============================================================

def remove_noise(audio, sr):
    print("  → Removing noise...")
    return nr.reduce_noise(y=audio, sr=sr, prop_decrease=0.8)

def improve_clarity(audio, sr):
    print("  → Improving clarity...")
    low  = 1000 / (sr / 2)
    high = 4000 / (sr / 2)
    b, a = butter(N=2, Wn=[low, high], btype='band')
    mids = lfilter(b, a, audio)
    return audio + (mids * 0.5)

def boost_bass(audio, sr, gain=1.5):
    print("  → Boosting bass...")
    b, a = butter(N=2, Wn=200 / (sr / 2), btype='low')
    bass = lfilter(b, a, audio)
    return audio + (bass * (gain - 1))

def boost_treble(audio, sr, gain=1.5):
    print("  → Boosting treble...")
    b, a = butter(N=2, Wn=4000 / (sr / 2), btype='high')
    treble = lfilter(b, a, audio)
    return audio + (treble * (gain - 1))

def normalize(audio):
    peak = np.max(np.abs(audio))
    return audio / peak * 0.95 if peak > 0 else audio


# ============================================================
# 🌐 API ROUTES
# These are the URLs your phone app will call.
# ============================================================

@app.route("/health", methods=["GET"])
def health():
    """
    Simple check — the app calls this to confirm
    the server is running before doing anything else.
    """
    return jsonify({"status": "ok", "message": "Server is running! 🎵"})


@app.route("/enhance", methods=["POST"])
def enhance():
    """
    Main enhancement endpoint.
    Phone sends audio file + enhancement options.
    Server returns the enhanced audio file.
    """
    print("\n📥 Received audio file from phone...")

    # ── Get the audio file from the request ──
    if "audio" not in request.files:
        return jsonify({"error": "No audio file received"}), 400

    audio_file = request.files["audio"]

    # ── Get which enhancements to apply ──
    noise_removal = request.form.get("noiseRemoval") == "true"
    voice_clarity = request.form.get("voiceClarity") == "true"
    bass_boost    = request.form.get("bassBoost")    == "true"
    treble_boost  = request.form.get("trebleBoost")  == "true"

    print(f"  Enhancements: noise={noise_removal}, clarity={voice_clarity}, bass={bass_boost}, treble={treble_boost}")

    try:
        # ── Save uploaded file to a temp location ──
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
            audio_file.save(tmp_in.name)
            input_path = tmp_in.name

        # ── Read the audio ──
        audio_data, sample_rate = sf.read(input_path)

        # Convert stereo to mono if needed
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        # ── Apply enhancements ──
        enhanced = audio_data.copy()

        if noise_removal:
            enhanced = remove_noise(enhanced, sample_rate)
        if voice_clarity:
            enhanced = improve_clarity(enhanced, sample_rate)
        if bass_boost:
            enhanced = boost_bass(enhanced, sample_rate)
        if treble_boost:
            enhanced = boost_treble(enhanced, sample_rate)

        enhanced = normalize(enhanced)

        # ── Save enhanced audio to a temp file ──
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_out:
            sf.write(tmp_out.name, enhanced, sample_rate)
            output_path = tmp_out.name

        print("✅ Enhancement complete! Sending back to phone...")

        # ── Send the enhanced file back to the phone ──
        return send_file(
            output_path,
            mimetype="audio/wav",
            as_attachment=True,
            download_name="enhanced.wav"
        )

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        # Clean up temp files
        try:
            os.unlink(input_path)
        except:
            pass


# ============================================================
# 🚀 START THE SERVER
# ============================================================

if __name__ == "__main__":
    print("=" * 45)
    print("🎵 AI Audio Enhancer Server")
    print("=" * 45)
    print("✅ Server running on http://localhost:5000")
    print("📱 Make sure ngrok is running too!")
    print("=" * 45)
    app.run(host="0.0.0.0", port=5000, debug=True)