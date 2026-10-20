<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:09090B,40:312E81,100:2563EB&height=200&section=header&text=Video%20QR%20Detector&fontSize=42&fontColor=FFFFFF&fontAlignY=38&desc=Detect%20QR%20codes%20inside%20videos&descSize=16&descAlignY=58&animation=fadeIn" width="100%" alt="Video QR Detector banner" />
</p>

------------------------------------------------------------------------

## ✨ Features

-   🔎 **Automatic detection** --- scans video frames for QR codes while
    a video is playing.
-   🔗 **Clickable results** --- displays a link overlay for detected
    QR-code content.
-   🎞️ **Video overlay** --- positions the result over the corresponding
    area of the video.
-   🧭 **Dynamic-page support** --- watches for videos added dynamically
    and handles common single-page-app navigation.
-   ⏯️ **Playback-aware scanning** --- updates detections as the video
    plays, pauses, or seeks.
-   ⚙️ **Enable/disable setting** --- reads the scanner state from
    extension storage.

## 🧰 Tech stack

-   JavaScript
-   Chrome Extensions Manifest V3
-   [jsQR](https://github.com/cozmo/jsQR) for QR-code decoding
-   HTML and CSS

## 📦 Installation

This project is intended to be loaded as an unpacked Chromium extension.

1.  Download or clone this repository.
2.  Make sure all files referenced by `manifest.json` are present in the
    project directory.
3.  Open `chrome://extensions` in Chrome or the equivalent extensions
    page in a Chromium-based browser.
4.  Enable **Developer mode**.
5.  Select **Load unpacked** and choose the project directory.
6.  Open a page containing a video and test the extension.

> **Note:** The current manifest references `jsqr.js`, `content.js`,
> `overlay.css`, and `popup.html`. Ensure these files are included
> before loading the extension. The `jsqr.js` file should contain the
> jsQR library.

## 🗂️ Project structure

The extension expects a structure similar to this:

``` text
video-qr-detector/
├── manifest.json
├── content.js
├── jsqr.js
├── overlay.css
├── popup.html
└── popup.js
```

Your actual project may contain additional files. Keep the file paths
consistent with `manifest.json`.

## 🔒 Permissions

The manifest currently requests:

-   `activeTab` --- access to the active tab when permitted by the
    browser.
-   `storage` --- save and read extension settings.

The content script is configured to run on pages matching `<all_urls>`.
Review this scope and narrow it if broad access is not needed for your
use case.

## 📝 How it works

1.  The content script discovers video elements on the page.
2.  While a video is playing, it periodically draws a downscaled frame
    to a canvas.
3.  `jsQR` attempts to decode QR codes in the frame.
4.  When a code is detected, the extension places an overlay over the
    detected area.
5.  URL values are shown as clickable links; non-URL values are offered
    as a Google search.

## ⚠️ Limitations

-   Detection depends on QR-code size, sharpness, contrast, and how long
    the code remains visible.
-   Some videos may not be readable due to browser security
    restrictions, cross-origin media, or protected playback.
-   The extension's behavior may vary between video players and
    websites.
-   The repository should include the referenced popup, stylesheet, and
    QR-decoder library files for the complete extension to work.

## 🛣️ Roadmap

-   [ ] Test across more video players and websites.
-   [ ] Improve handling of duplicate and short-lived detections.
-   [ ] Add screenshots or a short demo.
-   [ ] Review permissions and document browser compatibility.

------------------------------------------------------------------------

<p align="center">
  Made by <a href="https://github.com/hashy143">@hashy143</a>
</p>
