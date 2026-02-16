#!/bin/bash

# Debug git authentication issues
LOG_FILE="/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log"

log_debug() {
    local hypothesis=$1
    local message=$2
    local data=$3
    local timestamp=$(date +%s%3N)
    echo "{\"timestamp\":$timestamp,\"location\":\"debug_git_auth.sh:$(caller)\",\"message\":\"$message\",\"data\":$data,\"hypothesisId\":\"$hypothesis\"}" >> "$LOG_FILE"
}

cd /Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server

# Hypothesis F: Check for hanging git processes
log_debug "F" "Checking running git processes" "{\"git_processes\":\"$(ps aux | grep -v grep | grep git | wc -l)\",\"details\":\"$(ps aux | grep -v grep | grep git | head -3 | tr '\n' ';')\"}"

# Hypothesis G: Test git ls-remote with proper timeout 
log_debug "G" "Testing remote connectivity" "{\"start_time\":\"$(date)\"}"
git ls-remote origin HEAD 2>&1 | head -1 > /tmp/git_test_result &
GIT_PID=$!
sleep 5
if kill -0 $GIT_PID 2>/dev/null; then
    kill $GIT_PID 2>/dev/null
    log_debug "G" "git ls-remote timeout" "{\"result\":\"timeout after 5s\",\"pid\":\"$GIT_PID\"}"
else
    RESULT=$(cat /tmp/git_test_result 2>/dev/null)
    log_debug "G" "git ls-remote completed" "{\"result\":\"$RESULT\"}"
fi

# Hypothesis H: Test git credential helper
log_debug "H" "Testing git credentials" "{\"credential_helper\":\"$(git config --get credential.helper 2>&1)\",\"stored_credentials\":\"$(git config --get-regexp credential 2>&1 | wc -l)\"}"

# Hypothesis I: Check current commit vs remote
log_debug "I" "Comparing local vs remote" "{\"local_commit\":\"$(git rev-parse HEAD)\",\"remote_commit\":\"$(git rev-parse origin/main 2>&1)\",\"ahead_behind\":\"$(git rev-list --count --left-right origin/main...HEAD 2>&1)\"}"

echo "Git auth debug complete"