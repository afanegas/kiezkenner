# KiezKenner 🗺️

**KiezKenner** is an interactive, web-based geography learning game for Berlin's districts, neighborhoods, planning areas, stations, and streets.

Built with **MapLibre GL JS**, **Turf.js**, and **Vite**.

---

## 🚀 Features

*   **5 Game Modes**: Ortsteile (Districts), Quartiere (Neighborhoods), PLR (Planning Areas), Bahnhöfe (Stations), and Straßen (Streets).
*   **Dual Modes**:
    *   **Lernen (Learn)**: Click around the map to explore and learn names.
    *   **Spielen (Play)**: A quiz game to locate requested places (3 lives).
*   **Custom Map Editor**: Create, export, or upload custom GeoJSON files to practice your own custom regions.
*   **Adaptive Difficulty**: Scale from *Tourist* (major streets) to *Taxi Driver* (all paths).
*   **Detailed Stats**: Keep track of your performance (time, correct on 1st attempt, errors).

---

## 🛠️ Tech Stack

*   **Frontend**: HTML5, Vanilla CSS (Glassmorphic UI), JavaScript (ES Modules)
*   **Map Rendering**: MapLibre GL JS
*   **Spatial Operations**: Turf.js
*   **Bundler**: Vite

---

## 💻 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone the repository and navigate into it:
   ```bash
   git clone https://github.com/your-username/kiezkenner.git
   cd kiezkenner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```
