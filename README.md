# icesat2-cesium

A CesiumJS web application that shows the current position of ICESat-2 (NORAD 43613) in real time. The page downloads ICESat-2's two-line element set (TLE) from CelesTrak and propagates it in the browser with satellite.js (SGP4), updating the satellite entity every frame. It also draws the orbit path one period behind and one ahead, the ground track, and a panel with live latitude, longitude, altitude, and TLE epoch.

## Requirements

- A free Cesium ion access token (https://ion.cesium.com/tokens) for imagery and terrain
- Python 3, or any static file server

CesiumJS 1.146.0 and satellite.js 5.0.0 load from the jsDelivr CDN, so there is no build step.

## Setup

1. Copy the configuration template and add your token:

   ```
   cp config.example.js config.js
   ```

   Edit `config.js` and set `window.CESIUM_ION_TOKEN`. Git ignores `config.js`, so the token is never committed.

2. Serve the folder:

   ```
   python3 -m http.server 8765
   ```

3. Open http://localhost:8765/ in a browser.

## Usage

- **Follow ICESat-2** locks the camera onto the satellite. Click again to release it.
- The orbit path is cyan and the ground track is yellow. Both are rebuilt every 60 s.
- The TLE is downloaded again every 6 h.

These intervals are constants at the top of `app.js`.
