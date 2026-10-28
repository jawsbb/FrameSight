#!/usr/bin/env bash
# Prépare un espace de travail Superset : dépendances de l'interface (Rust se compile au premier lancement).
set -euo pipefail
cd app && pnpm install --frozen-lockfile
