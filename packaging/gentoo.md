# Gentoo

> [!NOTE]
> FrameSight has no Gentoo overlay yet. What follows describes TennoScope's, the
> [`deftera`](https://github.com/Deftera186/deftera-overlay) overlay, which packages TennoScope and
> not this fork; it is kept as the model for one.

TennoScope is packaged in the `deftera` overlay, which is listed in the [official Gentoo overlays
database](https://api.gentoo.org/overlays/repositories.xml). The ebuilds live there rather than in
this repository, one copy maintained where `pkgcheck` runs against it. The release
procedure that moves the overlay is `RELEASING.md` step 7.

```bash
sudo emerge --ask app-eselect/eselect-repository
sudo eselect repository enable deftera
sudo emaint sync --repo deftera
```

## Which package

**`games-util/framesight-bin`** unpacks the `.deb` from the GitHub release. It installs in seconds,
needs no Node or Rust toolchain, and is the recommended package.

```bash
sudo emerge --ask games-util/framesight-bin
```

**`games-util/framesight`** builds from the release tarball. It needs `sys-apps/pnpm-bin` from
[`::guru`](https://wiki.gentoo.org/wiki/Project:GURU), and a one-off `FEATURES` override because
pnpm and cargo both resolve their lockfiles over the network during the build:

```bash
sudo eselect repository enable guru && sudo emaint sync --repo guru
sudo FEATURES="-network-sandbox" emerge --ask games-util/framesight
```

The two block each other; emerge one or the other.

## Runtime dependencies

Both pull in the WebKitGTK stack, plus `x11-misc/xdg-utils`, which the Diagnostics report's
issue link and saved-report folder shell out to through `xdg-open`, plus `app-text/tesseract`,
the OCR engine behind the reward cards and the Ducat Kiosk reads, whose English data is
installed unconditionally. ImageMagick is no longer needed.

`x11-apps/xwininfo` is the other external program the reward reader spawns, and unlike tesseract it
is not a requirement: only Wine's virtual-desktop mode calls it. Portage cannot recommend a
package, so the overlay ebuilds cannot declare it. Install it yourself if
you run the game that way:

```bash
sudo emerge --ask x11-apps/xwininfo
```

The symptom to look for is not a package name but the Diagnostics `Reward observer` row, which
reads `Screen capture failed: xwininfo is not installed`. It appears once a reward read has run, so
a Wine virtual-desktop user meets it the first time a relic cracks, and only on an X11 session:
on Wayland the native backends take over and the X11 lookup error is not reported.

## KDE screen-capture authorization

KWin permits silent ScreenShot2 capture only when FrameSight is installed with its desktop entry.
If capture says it was not authorized, close the checkout or raw `target/` binary and launch the
installed `games-util/framesight` or `games-util/framesight-bin` package. Downstream ebuilds must
preserve `X-KDE-DBUS-Restricted-Interfaces=org.kde.KWin.ScreenShot2`, which both
[`framesight.desktop`](framesight.desktop) and the deb/rpm template
[`../app/src-tauri/framesight.desktop.hbs`](../app/src-tauri/framesight.desktop.hbs) carry.
AppImages cannot use this KWin authorization path and use the portal fallback instead.

## Building an untagged commit

There is no ebuild for this: a local checkout has no immutable `SRC_URI` to point at. Do not run
the raw `target/` binary for KDE capture because it has no installed desktop-entry identity.
Build the AppImage instead; it uses the portal fallback.

```bash
./scripts/build-linux-bundles.sh appimage
```
