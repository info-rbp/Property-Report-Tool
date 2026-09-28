#!/usr/bin/env bash
set -euo pipefail

PORT="${API_TEST_PORT:-8787}"
BASE_URL="http://127.0.0.1:${PORT}"
STATE_DIR=".wrangler-api-integration"
LOG_FILE=".wrangler-api-integration.log"
PID=""

cleanup() {
  if [[ -n "${PID}" ]]; then
    kill "${PID}" >/dev/null 2>&1 || true
    wait "${PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

json_field() {
  local field="$1"
  python3 -c "import json,sys; print(json.load(sys.stdin)$field)"
}

start_worker() {
  local role="$1"
  cleanup
  PID=""
  bunx wrangler dev --local --port "${PORT}" --persist-to "${STATE_DIR}" \
    --var DEV_USER_EMAIL:integration@proinspect.test \
    --var DEV_USER_ROLE:"${role}" >"${LOG_FILE}" 2>&1 &
  PID="$!"

  for _ in $(seq 1 60); do
    if curl -fsS "${BASE_URL}/api/me" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done

  cat "${LOG_FILE}" >&2
  echo "Worker did not become ready." >&2
  exit 1
}

assert_status() {
  local expected="$1"
  shift
  local actual
  actual=$(curl -sS -o /tmp/proinspect-api-response.json -w "%{http_code}" "$@")
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Expected HTTP ${expected}, got ${actual}" >&2
    cat /tmp/proinspect-api-response.json >&2 || true
    exit 1
  fi
}

rm -rf "${STATE_DIR}" "${LOG_FILE}"
bunx wrangler d1 migrations apply proinspect-property-reports --local --persist-to "${STATE_DIR}"
start_worker admin

me=$(curl -fsS "${BASE_URL}/api/me")
[[ "$(printf '%s' "${me}" | json_field "['role']")" == "admin" ]]

property=$(curl -fsS -X POST "${BASE_URL}/api/properties" \
  -H "Content-Type: application/json" \
  --data '{"address":"99 Integration Test Street, Perth WA 6000","reference":"INT-001","notes":"API integration fixture"}')
property_id=$(printf '%s' "${property}" | json_field "['id']")

assert_status 409 -X POST "${BASE_URL}/api/properties" \
  -H "Content-Type: application/json" \
  --data '{"address":"99 Integration Test Street, Perth WA 6000"}'
[[ "$(json_field "['code']" </tmp/proinspect-api-response.json)" == "duplicate-property" ]]

report_payload='{"schemaVersion":5,"details":{"reportType":"Routine","formName":"Routine Inspection Report","actNotice":"","companyName":"ProInspect","companyAddress":"19 Bonnard Crescent Ashby WA 6065","companyPhone":"1300 000 000","propertyAddress":"","inspectingAgent":"Integration Tester","inspectionDate":"2026-09-28","tenancyStartDate":"","tenants":"","reportReturnDate":"","additionalComments":"","agentSignName":"Integration Tester","agentSignDate":"2026-09-28","disclaimerText":"Integration test"},"areas":[{"id":"area-general","name":"General","items":[{"id":"item-overall","name":"Overall","agentComments":"Integration observation"}]}],"photos":[]}'

report=$(curl -fsS -X POST "${BASE_URL}/api/properties/${property_id}/reports" \
  -H "Content-Type: application/json" \
  --data "{"reportType":"Routine","report":${report_payload}}")
report_id=$(printf '%s' "${report}" | json_field "['id']")
revision=$(printf '%s' "${report}" | json_field "['revision']")
[[ "${revision}" == "1" ]]

saved=$(curl -fsS -X PUT "${BASE_URL}/api/reports/${report_id}" \
  -H "Content-Type: application/json" \
  --data "{"report":${report_payload},"expectedRevision":1}")
revision=$(printf '%s' "${saved}" | json_field "['revision']")
[[ "${revision}" == "2" ]]

assert_status 409 -X PUT "${BASE_URL}/api/reports/${report_id}" \
  -H "Content-Type: application/json" \
  --data "{"report":${report_payload},"expectedRevision":1}"
[[ "$(json_field "['code']" </tmp/proinspect-api-response.json)" == "report-revision-conflict" ]]

printf '%s' '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==' | base64 -d >/tmp/proinspect-test.jpg

photo_response=$(curl -fsS -X POST "${BASE_URL}/api/reports/${report_id}/photos" \
  -F "file=@/tmp/proinspect-test.jpg;type=image/jpeg" \
  -F "photoId=photo-1" \
  -F "name=General: Overall (photo 1)" \
  -F "areaName=General" \
  -F "areaId=area-general" \
  -F "photoIndex=1" \
  -F "isCover=true" \
  -F "expectedRevision=2")
revision=$(printf '%s' "${photo_response}" | json_field "['revision']")
[[ "${revision}" == "3" ]]

assert_status 409 -X DELETE "${BASE_URL}/api/reports/${report_id}/photos/photo-1?expectedRevision=2"
photo_deleted=$(curl -fsS -X DELETE "${BASE_URL}/api/reports/${report_id}/photos/photo-1?expectedRevision=3")
revision=$(printf '%s' "${photo_deleted}" | json_field "['revision']")
[[ "${revision}" == "4" ]]

printf '%s' '%PDF-1.4
1 0 obj
<<>>
endobj
trailer
<<>>
%%EOF' >/tmp/proinspect-test.pdf

assert_status 409 -X POST "${BASE_URL}/api/reports/${report_id}/complete?expectedRevision=3" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/proinspect-test.pdf

completed=$(curl -fsS -X POST "${BASE_URL}/api/reports/${report_id}/complete?expectedRevision=4" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/proinspect-test.pdf)
[[ "$(printf '%s' "${completed}" | json_field "['status']")" == "completed" ]]

assert_status 409 -X PUT "${BASE_URL}/api/reports/${report_id}" \
  -H "Content-Type: application/json" \
  --data "{"report":${report_payload},"expectedRevision":5}"

bunx wrangler r2 object delete "proinspect-property-reports-data/reports/${report_id}/completed/report.pdf" \
  --local --persist-to "${STATE_DIR}" --force
assert_status 200 "${BASE_URL}/api/reports/${report_id}/pdf"

correction=$(curl -fsS -X POST "${BASE_URL}/api/reports/${report_id}/correction")
correction_id=$(printf '%s' "${correction}" | json_field "['id']")
[[ "$(printf '%s' "${correction}" | json_field "['supersedesReportId']")" == "${report_id}" ]]

curl -fsS -X POST "${BASE_URL}/api/reports/${correction_id}/complete?expectedRevision=1" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/proinspect-test.pdf >/tmp/proinspect-correction.json

property_after=$(curl -fsS "${BASE_URL}/api/properties/${property_id}")
original_status=$(printf '%s' "${property_after}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next(r['status'] for r in d['reports'] if r['id']=='${report_id}'))")
[[ "${original_status}" == "superseded" ]]

curl -fsS -X POST "${BASE_URL}/api/properties/${property_id}/archive" >/tmp/proinspect-archived.json
active_list=$(curl -fsS "${BASE_URL}/api/properties")
[[ "$(printf '%s' "${active_list}" | python3 -c "import json,sys; print(any(p['id']=='${property_id}' for p in json.load(sys.stdin)))")" == "False" ]]
all_list=$(curl -fsS "${BASE_URL}/api/properties?includeArchived=true")
[[ "$(printf '%s' "${all_list}" | python3 -c "import json,sys; print(any(p['id']=='${property_id}' and p.get('archivedAt') for p in json.load(sys.stdin)))")" == "True" ]]
curl -fsS -X POST "${BASE_URL}/api/properties/${property_id}/restore" >/dev/null

start_worker viewer
viewer_me=$(curl -fsS "${BASE_URL}/api/me")
[[ "$(printf '%s' "${viewer_me}" | json_field "['role']")" == "viewer" ]]
assert_status 403 -X POST "${BASE_URL}/api/properties" \
  -H "Content-Type: application/json" \
  --data '{"address":"Viewer Must Not Create"}'
[[ "$(json_field "['code']" </tmp/proinspect-api-response.json)" == "insufficient-role" ]]

echo "Worker/API integration verification passed."
