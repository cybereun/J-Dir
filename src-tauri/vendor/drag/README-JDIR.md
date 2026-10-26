# drag (vendored, Windows only)

Copy of the `drag` crate 2.1.1 by CrabNebula Ltd. (https://github.com/crabnebula-dev/drag-rs),
licensed under Apache-2.0 OR MIT (see LICENSE_APACHE-2.0 / LICENSE_MIT).

Local changes for J-Dir:
- Removed the macOS and GTK backends (J-Dir is Windows-only).
- Added `DragMode::CopyMove`, which allows both DROPEFFECT_COPY and DROPEFFECT_MOVE so the drop
  target (Explorer, browsers, J-Dir panes) decides according to its usual rules. Upstream can only
  allow a single effect, which would make "move within the same drive" impossible.
