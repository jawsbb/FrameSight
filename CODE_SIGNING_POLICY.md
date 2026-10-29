# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

> [!NOTE]
> FrameSight has applied to the SignPath Foundation program. Until the first signed release is
> published, the Windows installer is unsigned and Windows warns before running it; the
> [install guide](docs/install.md#windows) says how to get past that.

## What is signed

The Windows build of FrameSight: `framesight.exe` and the `FrameSight_<version>_x64-setup.exe`
installer that carries it. Both are built from this repository by
[`.github/workflows/release.yml`](.github/workflows/release.yml) on GitHub-hosted runners, from a
`v*` tag, and nothing built anywhere else is submitted for signing.

The installer also carries Tesseract OCR, taken unmodified from the
[UB Mannheim build](https://github.com/UB-Mannheim/tesseract) by
[`scripts/vendor-windows-tesseract.ps1`](scripts/vendor-windows-tesseract.ps1). Those binaries are
upstream's and are not signed under this project's certificate.

Every signing request is approved by hand before it is signed.

## Team roles

| Role | Members |
| --- | --- |
| Committers and reviewers | [jawsbb](https://github.com/jawsbb) |
| Approvers | [jawsbb](https://github.com/jawsbb) (repository owner) |

Changes from anyone else arrive as pull requests and are reviewed before they are merged. Every
team member uses multi-factor authentication on GitHub and on SignPath.

## Privacy policy

FrameSight has no account, no server of its own and no telemetry. It does not transfer
information to other networked systems unless the person running it asks for the feature that
needs it. Each request below goes out only for the feature named, and carries nothing about the
player beyond what is listed.

| Destination | When | What it sends |
| --- | --- | --- |
| `mobile.warframe.com` | Full access only, to read the inventory | The account ID and session nonce read from the running game, to Digital Extremes' own inventory endpoint |
| `api.warframe.market`, `warframe.market` | Prices, and the market pages once an account is linked | Item names; with a linked account, the token the player gave and the orders they place |
| `relics.run` | Collection prices | Item names |
| `api.warframe.com`, `api.warframestat.us`, `raw.githubusercontent.com` | World timers, the item catalog and item images | Nothing beyond the request |
| `github.com` | Update checks; the daily check is a setting and can be turned off | Nothing beyond the request |

The account ID and nonce are never written to disk or logs, and are sent nowhere but
`mobile.warframe.com`. See [SECURITY.md](SECURITY.md) for how they are handled and how to report
a problem.
