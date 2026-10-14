# ZenMines 💎💣

> A sleek, modern offline minesweeper with safe first-tap guarantee, intelligent flag assist, procedural Web Audio effects, and smart chording.

[![CI](https://github.com/OfferPk/zenmines/actions/workflows/ci.yml/badge.svg)](https://github.com/OfferPk/zenmines/actions/workflows/ci.yml)
[![Pages](https://github.com/OfferPk/zenmines/actions/workflows/pages.yml/badge.svg)](https://offerpk.github.io/zenmines/)
[![Android](https://github.com/OfferPk/zenmines/actions/workflows/android.yml/badge.svg)](https://github.com/OfferPk/zenmines/actions/workflows/android.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌐 Live Web Demo

Play directly in your browser:  
👉 **[https://offerpk.github.io/zenmines/](https://offerpk.github.io/zenmines/)**

Works 100% offline via PWA Service Worker caching. Installable to your home screen on Android, iOS, Windows, and macOS.

---

## 📱 Android APK Download

- **GitHub Actions Debug APK**: Download the latest built APK directly from the [Android Build Artifacts](https://github.com/OfferPk/zenmines/actions/workflows/android.yml) (Artifact name: `zenmines-apk`).
- **Releases**: Tagged releases provide direct standalone APK downloads under [GitHub Releases](https://github.com/OfferPk/zenmines/releases).

---

## 📸 Screenshots

| Desktop View | Mobile View | Theme Selection |
| :---: | :---: | :---: |
| _[ Zen Dark 9x9 Gameplay ]_ | _[ Responsive Mobile View ]_ | _[ Neon Pulse / Paper Light ]_ |

---

## ✨ Features

- **Safe First Tap Guarantee**: The first cell you reveal (and its surrounding 3×3 zone) is never a mine, ensuring an immediate opening cascade.
- **Multiple Grids**:
  - Beginner: 9×9 with 10 mines
  - Intermediate: 16×16 with 40 mines
  - Expert: 16×30 with 99 mines
- **Dual Play Controls**:
  - Quick Mode toggle: Dig ⛏️ vs Flag 🚩
  - Long-press to flag / dig on touchscreens
  - Right-click support on mouse
  - Smart chording: tap any revealed number whose flag count matches to uncover safe neighbors
- **Procedural Audio & Haptics**: Synthesized sound effects generated locally via Web Audio API (zero audio file downloads needed) + gentle haptic vibration feedback.
- **Deductive Hint Assistant**: Logic solver suggests valid moves if you are stuck.
- **Themes**: Zen Dark, Paper Light, and Neon Pulse.
- **Personal Statistics**: Track games played, win percentage, winning streaks, and best completion times.
- **100% Offline & Private**: Zero data collected, no ads, no trackers, no external network dependencies.

---

## 🛠️ Local Development & Build

### Prerequisites
- Node.js >= 20
- npm >= 10

### Setup
```bash
git clone https://github.com/OfferPk/zenmines.git
cd zenmines
npm install
```

### Run Tests
```bash
npm test
```

### Build Web Assets
```bash
npm run build
```
This builds and synchronizes all web runtime files into `www/`.

### Android Build (Capacitor)
```bash
npx cap sync android
cd android
./gradlew assembleDebug
```
The output APK will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 OfferPk.
