#!/usr/bin/env bash
set -euo pipefail

BASE="${SWEEP_BASE_URL:-http://127.0.0.1:3001}"

cases=(
  "2013 Sienna XLE low miles|/evaluate?year=2013&make=Toyota&model=Sienna&trim=XLE&mileage=42000&zip=94598&condition=excellent&transmission=automatic&wear=missing+rear+view+mirror"
  "2012 Prius LE higher miles|/evaluate?year=2012&make=Toyota&model=Prius&trim=LE&mileage=140000&zip=92101&condition=good&transmission=automatic&wear=bad+tires%3B+cracked+tail+light"
  "2004 BMW Z4 3.0|/evaluate?year=2004&make=BMW&model=Z4&trim=3.0&mileage=139000&zip=94598&condition=good&transmission=automatic&mods=BlueBus%3B+cooling+system+refresh%3B+full+brake+service&wear=torn+seats%3B+clear+coat+peeling"
)

for c in "${cases[@]}"; do
  label="${c%%|*}"
  path="${c#*|}"
  url="${BASE}${path}"
  echo ""
  echo "== ${label} =="
  echo "${url}"
  curl -s -m 45 "${url}" | python3 -c "import re,sys; h=sys.stdin.read(); m=lambda p:(re.search(p,h).group(1) if re.search(p,h) else None); print({'comp_count': m(r'(\\d+)<!-- --> comparables'), 'low': m(r'\\$<!-- -->([0-9,]+)<!-- -->\\s*[–-]\\s*\\$<!-- -->[0-9,]+<!-- -->'), 'high': m(r'\\$<!-- -->[0-9,]+<!-- -->\\s*[–-]\\s*\\$<!-- -->([0-9,]+)'), 'mid': m(r'Mid:\\s*\\$<!-- -->([0-9,]+)'), 'sources_used': m(r'Sources used:\\s*<!-- -->([^<]+)<!-- -->\\.')})"
done

