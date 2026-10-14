/**
 * ZenMines - Procedural Web Audio & Haptics Engine
 * 100% offline, zero network requests, zero audio assets required.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZenAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ctx = null;
  var soundEnabled = true;
  var hapticsEnabled = true;

  function getAudioContext() {
    if (!ctx && (typeof window !== 'undefined')) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function playTone(freq, type, duration, gainVal, decay) {
    if (!soundEnabled) return;
    try {
      var c = getAudioContext();
      if (!c) return;

      var osc = c.createOscillator();
      var gain = c.createGain();

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);

      gain.gain.setValueAtTime(gainVal || 0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (duration || 0.1));

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start();
      osc.stop(c.currentTime + (duration || 0.1));
    } catch (e) {}
  }

  function vibrate(pattern) {
    if (!hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }

  var ZenAudio = {
    init: function () {
      if (typeof localStorage !== 'undefined') {
        soundEnabled = localStorage.getItem('zenmines_sound') !== '0';
        hapticsEnabled = localStorage.getItem('zenmines_haptics') !== '0';
      }
      // Unlock audio on first gesture
      var unlock = function () {
        getAudioContext();
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
      }
    },

    isSoundEnabled: function () {
      return soundEnabled;
    },

    setSoundEnabled: function (enabled) {
      soundEnabled = !!enabled;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zenmines_sound', soundEnabled ? '1' : '0');
      }
    },

    isHapticsEnabled: function () {
      return hapticsEnabled;
    },

    setHapticsEnabled: function (enabled) {
      hapticsEnabled = !!enabled;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zenmines_haptics', hapticsEnabled ? '1' : '0');
      }
    },

    playClick: function () {
      playTone(600, 'triangle', 0.04, 0.12);
      vibrate(10);
    },

    playReveal: function () {
      playTone(480, 'sine', 0.06, 0.15);
      vibrate(12);
    },

    playCascade: function (step) {
      var base = 350 + Math.min(step * 30, 400);
      playTone(base, 'sine', 0.08, 0.1);
    },

    playFlag: function () {
      if (!soundEnabled) return;
      try {
        var c = getAudioContext();
        if (!c) return;
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, c.currentTime + 0.12);
        gain.gain.setValueAtTime(0.18, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.15);
      } catch (e) {}
      vibrate(25);
    },

    playUnflag: function () {
      if (!soundEnabled) return;
      try {
        var c = getAudioContext();
        if (!c) return;
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, c.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.15);
      } catch (e) {}
      vibrate(15);
    },

    playChord: function () {
      playTone(523.25, 'triangle', 0.12, 0.12);
      setTimeout(function () {
        playTone(659.25, 'triangle', 0.12, 0.12);
      }, 50);
      vibrate([15, 30, 15]);
    },

    playHint: function () {
      playTone(698.46, 'sine', 0.2, 0.15);
      setTimeout(function () {
        playTone(880.0, 'sine', 0.25, 0.15);
      }, 80);
      vibrate([20, 40, 20]);
    },

    playWin: function () {
      if (!soundEnabled) return;
      var notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach(function (freq, idx) {
        setTimeout(function () {
          playTone(freq, 'sine', 0.35, 0.22);
        }, idx * 110);
      });
      vibrate([40, 60, 40, 60, 100]);
    },

    playExplode: function () {
      if (!soundEnabled) return;
      try {
        var c = getAudioContext();
        if (!c) return;
        // White noise burst with low-pass filter
        var bufferSize = c.sampleRate * 0.4;
        var buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        var noise = c.createBufferSource();
        noise.buffer = buffer;

        var filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, c.currentTime);
        filter.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.4);

        var gain = c.createGain();
        gain.gain.setValueAtTime(0.3, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(c.destination);

        noise.start();
        noise.stop(c.currentTime + 0.4);
      } catch (e) {}
      vibrate([80, 50, 120]);
    }
  };

  return ZenAudio;
});
